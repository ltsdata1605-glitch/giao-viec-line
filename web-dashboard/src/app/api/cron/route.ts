import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

export async function GET(request: Request) {
  try {
    // Vercel cron security check (Optional: verify secret header)
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!adminDb) {
      return NextResponse.json({ error: 'No db' }, { status: 500 });
    }

    const now = Date.now();
    
    // 1. Process Pending Tasks (Chờ gửi)
    const pendingTasksSnap = await adminDb.collection('tasks')
      .where('status', '==', 'Chờ gửi')
      .where('sendAt', '<=', now)
      .get();

    const tasksToNotify: any[] = [];
    const batch = adminDb.batch();

    for (const doc of pendingTasksSnap.docs) {
      const data = doc.data();
      tasksToNotify.push({ id: doc.id, ...data });
      batch.update(doc.ref, { status: 'Đang làm' });
    }

    await batch.commit();

    // Fire notifications for these tasks using the same notify-task endpoint logic
    for (const task of tasksToNotify) {
      try {
        const payload = {
          taskId: task.id,
          assignees: task.assignees || (task.assigneeId ? [task.assigneeId] : []),
          groupId: task.groupId || '',
          taskName: task.name || '',
          taskDescription: task.description || '',
          creatorId: 'U5bff120f01066eefca60fd0c8ea3537c' // Default Admin
        };
        
        // Use absolute URL since fetch in Next.js Server requires it, 
        // or just invoke the notification logic directly. 
        // Since we are in the server, let's call the host URL.
        const host = request.headers.get('host');
        const protocol = host?.includes('localhost') ? 'http' : 'https';
        await fetch(`${protocol}://${host}/api/notify-task`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } catch (e) {
        console.error('Failed to notify task via cron', task.id, e);
      }
    }

    // 2. Process Pending Keywords (Từ khoá hẹn giờ)
    const pendingKeywordsSnap = await adminDb.collection('keywords')
      .where('scheduleEnabled', '==', true)
      .where('sendAt', '<=', now)
      .get();

    const keywordsToNotify: any[] = [];
    const keywordBatch = adminDb.batch();

    const dayMap: Record<string, number> = { 'CN': 0, 'T2': 1, 'T3': 2, 'T4': 3, 'T5': 4, 'T6': 5, 'T7': 6 };

    for (const doc of pendingKeywordsSnap.docs) {
      const data = doc.data();
      keywordsToNotify.push({ id: doc.id, ...data });
      
      const repeat = data.repeat || 'Không';
      if (repeat === 'Không') {
        keywordBatch.update(doc.ref, { scheduleEnabled: false });
      } else {
        // Calculate next sendAt
        let nextSendAt = data.sendAt || now;
        const sendDate = new Date(nextSendAt);
        
        if (repeat === 'Hằng ngày') {
          do {
            sendDate.setDate(sendDate.getDate() + 1);
          } while (sendDate.getTime() <= now);
          keywordBatch.update(doc.ref, { sendAt: sendDate.getTime() });
        } else if (repeat === 'Hằng tháng') {
          do {
            sendDate.setMonth(sendDate.getMonth() + 1);
          } while (sendDate.getTime() <= now);
          keywordBatch.update(doc.ref, { sendAt: sendDate.getTime() });
        } else if (repeat === 'Hằng tuần') {
          const repeatDays = data.repeatDays || [];
          if (repeatDays.length > 0) {
            do {
              sendDate.setDate(sendDate.getDate() + 1);
              const dayStr = Object.keys(dayMap).find(k => dayMap[k] === sendDate.getDay());
              if (dayStr && repeatDays.includes(dayStr) && sendDate.getTime() > now) {
                break;
              }
            } while (true);
            keywordBatch.update(doc.ref, { sendAt: sendDate.getTime() });
          } else {
            // Fallback if no days selected: just add 7 days
            do {
              sendDate.setDate(sendDate.getDate() + 7);
            } while (sendDate.getTime() <= now);
            keywordBatch.update(doc.ref, { sendAt: sendDate.getTime() });
          }
        }
      }
    }

    await keywordBatch.commit();

    for (const kw of keywordsToNotify) {
      try {
        const payload = {
          keywordId: kw.id,
          keyword: kw.keyword || '',
          reply_text: kw.reply_text || '',
          image_urls: kw.image_urls || (kw.image_url ? [kw.image_url] : []),
          assignees: kw.assignees || [],
          groupIds: kw.groupIds || (kw.groupId ? [kw.groupId] : []),
        };
        
        const host = request.headers.get('host');
        const protocol = host?.includes('localhost') ? 'http' : 'https';
        await fetch(`${protocol}://${host}/api/notify-keyword`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } catch (e) {
        console.error('Failed to notify keyword via cron', kw.id, e);
      }
    }

    return NextResponse.json({ 
      success: true, 
      processedTasks: tasksToNotify.length,
      processedKeywords: keywordsToNotify.length,
      timestamp: now 
    });

  } catch (err: any) {
    console.error('Cron error', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
