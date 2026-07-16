import { NextResponse } from 'next/server';
import * as line from '@line/bot-sdk';
import { adminDb } from '@/lib/firebase-admin';
import { getUserDisplayName, buildAssigneeMentionMessage, buildTaskFlexMessage } from '@/lib/bot/tasks';

export async function POST(request: Request) {
  try {
    const { taskId, assigneeId, assignees, groupId, groupIds, taskName, taskDescription, creatorId } = await request.json();

    // Support both legacy single assigneeId and new array assignees
    let targetAssignees: string[] = [];
    if (assignees && Array.isArray(assignees) && assignees.length > 0) {
      targetAssignees = assignees;
    } else if (assigneeId) {
      targetAssignees = [assigneeId];
    }

    if (targetAssignees.length === 0 || !taskName) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    const client = new line.messagingApi.MessagingApiClient({
      channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || ''
    });

    const creatorName = await getUserDisplayName(creatorId);

    let assigneeNameStr = '';
    let deadlineStr = '';
    let acceptanceTypeStr = '';

    if (adminDb) {
      const taskSnap = await adminDb.collection('tasks').doc(taskId).get();
      if (taskSnap.exists) {
        const taskData = taskSnap.data();
        assigneeNameStr = taskData?.assigneeName || '';
        if (taskData?.deadline) {
          const d = new Date(taskData.deadline);
          if (!isNaN(d.getTime())) {
            const pad = (n: number) => n.toString().padStart(2, '0');
            deadlineStr = `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
          } else {
            deadlineStr = taskData.deadline;
          }
        }
        acceptanceTypeStr = taskData?.acceptanceType || '';
      }
    }

    const shortId = taskId.slice(-5);

    const mentionMessage = buildAssigneeMentionMessage(targetAssignees);
    const flexMessage = buildTaskFlexMessage({
      taskName,
      shortId,
      creatorName,
      assigneeText: assigneeNameStr || 'Chưa rõ',
      deadlineText: deadlineStr,
      acceptanceText: acceptanceTypeStr,
      description: taskDescription
    });

    const messagesToSend: line.messagingApi.Message[] = mentionMessage ? [mentionMessage, flexMessage] : [flexMessage];

    const targetGroupIds = groupIds && Array.isArray(groupIds) && groupIds.length > 0 ? groupIds : (groupId ? [groupId] : []);

    if (targetGroupIds.length > 0) {
      // Send to all Groups
      await Promise.all(targetGroupIds.map(gId => 
        client.pushMessage({
          to: gId,
          messages: messagesToSend
        }).catch(err => console.error(`Failed to push to group ${gId}`, err))
      ));
    } else {
      // Multicast to multiple users, or single push if only 1
      if (targetAssignees.length === 1) {
        await client.pushMessage({
          to: targetAssignees[0],
          messages: messagesToSend
        });
      } else {
        await client.multicast({
          to: targetAssignees,
          messages: messagesToSend
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Push notification error', err);
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
  }
}
