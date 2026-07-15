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

    return NextResponse.json({ 
      success: true, 
      processedTasks: tasksToNotify.length,
      timestamp: now 
    });

  } catch (err: any) {
    console.error('Cron error', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
