import { NextResponse } from 'next/server';
import * as line from '@line/bot-sdk';
import { adminDb } from '@/lib/firebase-admin';
import { buildTaskReminderMessage, buildTaskEscalationMessage, parseReminderMinutes } from '@/lib/bot/tasks';
import { parseVnDeadline, getVnDateKey } from '@/lib/dateUtils';
import { buildTaskReportText, buildInteractionReportText } from '@/lib/bot/report';
import { getAllAdminLineIds } from '@/lib/bot/admin';
import { sendGroupProgressReports, type ProgressSlot } from '@/lib/bot/progressReport';

/**
 * Tìm mốc thời gian kế tiếp rơi vào "ngày thứ N tính từ ngày cuối tháng" (N=0 là chính ngày cuối tháng,
 * N=2 là 2 ngày trước ngày cuối tháng...), giữ nguyên giờ:phút của sendDate, lặp qua từng tháng cho tới
 * khi kết quả lớn hơn `now`. Dùng chung cho "Ngày cuối tháng", "Trước ngày cuối/đầu tháng N ngày".
 */
function nextMonthAnchor(sendDate: Date, now: number, dayOffsetFromMonthEnd: number): Date {
  let year = sendDate.getFullYear();
  let month = sendDate.getMonth();
  const hours = sendDate.getHours();
  const minutes = sendDate.getMinutes();
  let candidate: Date;
  do {
    const lastDay = new Date(year, month + 1, 0).getDate();
    candidate = new Date(year, month, lastDay - dayOffsetFromMonthEnd, hours, minutes, 0, 0);
    month += 1;
    if (month > 11) { month = 0; year += 1; }
  } while (candidate.getTime() <= now);
  return candidate;
}

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
    const dayMap: Record<string, number> = { 'CN': 0, 'T2': 1, 'T3': 2, 'T4': 3, 'T5': 4, 'T6': 5, 'T7': 6 };
    // Dùng để gửi trực tiếp tin nhắc việc / leo thang, tận dụng flexQuoteTokens đã lưu theo từng nơi nhận
    // nên không đi qua /api/notify-task (endpoint đó luôn build lại thẻ Flex mới, không phù hợp cho nhắc nhẹ).
    const lineClient = new line.messagingApi.MessagingApiClient({
      channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || ''
    });

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
      // Đã gửi cho người nhận nhưng chưa ai nhận việc -> "Chưa làm" (khớp trạng thái bot dùng)
      batch.update(doc.ref, { status: 'Chưa làm' });
    }

    await batch.commit();

    // Fire notifications for these tasks using the same notify-task endpoint logic
    for (const task of tasksToNotify) {
      try {
        const payload = {
          taskId: task.id,
          assignees: task.assignees || (task.assigneeId ? [task.assigneeId] : []),
          groupId: task.groupId || '',
          groupIds: task.groupIds || [],
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

    // 1.5. Tự động phát hiện Task Quá hạn (deadline đã trôi qua mà vẫn chưa xong)
    // + leo thang: báo riêng cho người giao việc đúng 1 lần tại thời điểm chuyển sang Quá hạn
    // (task quá hạn sẽ không còn khớp query status in [Chưa làm, Đang làm] ở lần chạy cron sau,
    // nên tự nhiên không bị báo lặp lại).
    const activeTasksSnap = await adminDb.collection('tasks')
      .where('status', 'in', ['Chưa làm', 'Đang làm'])
      .get();

    const overdueBatch = adminDb.batch();
    const tasksToEscalate: any[] = [];

    for (const doc of activeTasksSnap.docs) {
      const data = doc.data();
      // Task lặp lại (repeat) coi như luôn "còn sống" theo chu kỳ riêng, không đánh dấu Quá hạn
      if (data.repeat && data.repeat !== 'Không') continue;
      const deadlineMs = parseVnDeadline(data.deadline);
      if (deadlineMs !== null && deadlineMs < now) {
        overdueBatch.update(doc.ref, { status: 'Quá hạn' });
        tasksToEscalate.push({ id: doc.id, ...data });
      }
    }

    if (tasksToEscalate.length > 0) await overdueBatch.commit();

    let escalatedCount = 0;
    for (const task of tasksToEscalate) {
      const creatorId: string = task.creatorId || '';
      if (!creatorId.startsWith('U')) continue; // không có người giao hợp lệ để báo
      try {
        const assigneeText = (task.assignees || []).join(', ') || 'người được giao';
        await lineClient.pushMessage({
          to: creatorId,
          messages: [buildTaskEscalationMessage(task.name || '', creatorId, assigneeText)]
        });
        escalatedCount++;
      } catch (e) {
        console.error('Failed to escalate overdue task', task.id, e);
      }
    }

    // 1.6. Nhắc việc định kỳ cho task còn hạn nhưng chưa xong, theo reminderFrequency của từng task.
    // Gửi tới đúng nơi (nhóm/phòng/cá nhân) đã nhận thẻ Flex gốc, kèm quoteToken trích dẫn nếu có.
    const justEscalatedIds = new Set(tasksToEscalate.map(t => t.id));
    const reminderBatch = adminDb.batch();
    let remindedCount = 0;

    for (const doc of activeTasksSnap.docs) {
      if (justEscalatedIds.has(doc.id)) continue; // vừa chuyển Quá hạn ở bước trên, không nhắc nữa
      const data = doc.data();
      const freqMinutes = parseReminderMinutes(data.reminderFrequency);
      if (!freqMinutes) continue; // không cấu hình nhắc lại

      const lastAt = data.lastReminderAt || data.sendAt || now;
      if (now - lastAt < freqMinutes * 60000) continue; // chưa tới giờ nhắc tiếp theo

      const quoteTokens: Record<string, string> = data.flexQuoteTokens || {};
      const chatKeys = Object.keys(quoteTokens);
      // Không có nơi chat đã lưu (task cũ trước bản cập nhật quote token) -> nhắc thẳng từng người nhận
      const targets = chatKeys.length > 0 ? chatKeys : (data.assignees || []).filter((id: string) => id.startsWith('U'));

      let sentAny = false;
      for (const target of targets) {
        try {
          await lineClient.pushMessage({
            to: target,
            messages: [buildTaskReminderMessage(data.name || '', data.assignees || [], quoteTokens[target])]
          });
          sentAny = true;
        } catch (e) {
          console.error('Failed to send task reminder', doc.id, target, e);
        }
      }

      if (sentAny) {
        reminderBatch.update(doc.ref, { lastReminderAt: now });
        remindedCount++;
      }
    }

    if (remindedCount > 0) await reminderBatch.commit();

    // 1.7. Xử lý Task lặp lại: gửi lại thông báo theo lịch, không phụ thuộc trạng thái hiện tại.
    const repeatingTasksSnap = await adminDb.collection('tasks').where('repeat', '!=', 'Không').get();
    const repeatBatch = adminDb.batch();
    const tasksToResend: any[] = [];

    // "Trước ngày cuối/đầu tháng N ngày": đọc số N trực tiếp từ nhãn để không phải hardcode theo từng preset
    const cuoiThangMatch = (label: string) => /Trước ngày cuối tháng (\d+) ngày/.exec(label);
    const dauThangMatch = (label: string) => /Trước ngày đầu tháng (\d+) ngày/.exec(label);
    // "Tuỳ chọn": parse cú pháp tự do dạng "Mỗi N ngày/tuần/tháng/giờ"
    const customMatch = (label: string) => /mỗi\s*(\d+)\s*(ngày|tuần|tháng|giờ)/i.exec(label);

    for (const doc of repeatingTasksSnap.docs) {
      const data = doc.data();
      if (!data.sendAt || data.sendAt > now) continue; // chưa tới giờ lặp tiếp theo

      const sendDate = new Date(data.sendAt);
      let supported = true;
      let cuoiThang, dauThang, custom;

      if (data.repeat === 'Hàng giờ') {
        const hours = parseInt(data.intervalHours, 10) || 1;
        do { sendDate.setHours(sendDate.getHours() + hours); } while (sendDate.getTime() <= now);
      } else if (data.repeat === 'Hàng ngày') {
        const repeatDays: string[] = data.repeatDays || [];
        if (repeatDays.length > 0) {
          do {
            sendDate.setDate(sendDate.getDate() + 1);
            const dayStr = Object.keys(dayMap).find(k => dayMap[k] === sendDate.getDay());
            if (dayStr && repeatDays.includes(dayStr) && sendDate.getTime() > now) break;
          } while (true);
        } else {
          do { sendDate.setDate(sendDate.getDate() + 1); } while (sendDate.getTime() <= now);
        }
      } else if (data.repeat === 'Hàng tuần') {
        do { sendDate.setDate(sendDate.getDate() + 7); } while (sendDate.getTime() <= now);
      } else if (data.repeat === 'Hàng tháng') {
        do { sendDate.setMonth(sendDate.getMonth() + 1); } while (sendDate.getTime() <= now);
      } else if (data.repeat === 'Ngày cuối tháng') {
        sendDate.setTime(nextMonthAnchor(sendDate, now, 0).getTime());
      } else if ((cuoiThang = cuoiThangMatch(data.repeat))) {
        // N ngày trước ngày cuối tháng
        sendDate.setTime(nextMonthAnchor(sendDate, now, parseInt(cuoiThang[1], 10)).getTime());
      } else if ((dauThang = dauThangMatch(data.repeat))) {
        // N ngày trước ngày 1 của tháng kế tiếp = (ngày cuối tháng hiện tại) - (N - 1)
        sendDate.setTime(nextMonthAnchor(sendDate, now, parseInt(dauThang[1], 10) - 1).getTime());
      } else if (data.repeat === 'Tuỳ chọn' && (custom = customMatch(data.customRepeat || ''))) {
        const n = parseInt(custom[1], 10);
        const unit = custom[2].toLowerCase();
        do {
          if (unit === 'giờ') sendDate.setHours(sendDate.getHours() + n);
          else if (unit === 'ngày') sendDate.setDate(sendDate.getDate() + n);
          else if (unit === 'tuần') sendDate.setDate(sendDate.getDate() + n * 7);
          else if (unit === 'tháng') sendDate.setMonth(sendDate.getMonth() + n);
        } while (sendDate.getTime() <= now);
      } else {
        // "Tuỳ chọn" với nội dung không theo mẫu "Mỗi N ngày/tuần/tháng/giờ" -> không đoán lịch, bỏ qua an toàn
        supported = false;
      }

      if (!supported) continue;

      repeatBatch.update(doc.ref, { sendAt: sendDate.getTime(), status: 'Chưa làm' });
      tasksToResend.push({ id: doc.id, ...data });
    }

    if (tasksToResend.length > 0) await repeatBatch.commit();

    for (const task of tasksToResend) {
      try {
        const payload = {
          taskId: task.id,
          assignees: task.assignees || (task.assigneeId ? [task.assigneeId] : []),
          groupId: task.groupId || '',
          groupIds: task.groupIds || [],
          taskName: task.name || '',
          taskDescription: task.description || '',
          creatorId: task.creatorId || 'U5bff120f01066eefca60fd0c8ea3537c'
        };

        const host = request.headers.get('host');
        const protocol = host?.includes('localhost') ? 'http' : 'https';
        await fetch(`${protocol}://${host}/api/notify-task`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } catch (e) {
        console.error('Failed to resend repeating task via cron', task.id, e);
      }
    }

    // 2. Process Pending Keywords (Từ khoá hẹn giờ)
    const pendingKeywordsSnap = await adminDb.collection('keywords')
      .where('scheduleEnabled', '==', true)
      .where('sendAt', '<=', now)
      .get();

    const keywordsToNotify: any[] = [];
    const keywordBatch = adminDb.batch();

    for (const doc of pendingKeywordsSnap.docs) {
      const data = doc.data();
      keywordsToNotify.push({ id: doc.id, ...data });
      
      const repeat = data.repeat || 'Không';
      if (repeat === 'Không') {
        keywordBatch.update(doc.ref, { scheduleEnabled: false });
      } else {
        // Calculate next sendAt
        const nextSendAt = data.sendAt || now;
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

    // 3. Báo cáo tự động hằng ngày: đẩy 2 báo cáo TÁCH RIÊNG (công việc + tương tác) cho toàn bộ admin
    // vào buổi sáng (từ 8h giờ VN), dưới dạng 2 tin nhắn riêng biệt trong cùng 1 lượt gửi.
    // Cron được gọi nhiều lần/ngày (qua dịch vụ ngoài, vì gói Vercel Hobby chỉ cho cron nội bộ chạy 1 lần/ngày)
    // nên phải chốt "đã gửi hôm nay chưa" qua systemState/autoReport để không gửi trùng nhiều lần trong ngày.
    let autoReportSent = false;
    try {
      const vnHour = new Date(now + 7 * 60 * 60 * 1000).getUTCHours();
      if (vnHour >= 8) {
        const todayKey = getVnDateKey(now);
        const stateRef = adminDb.collection('systemState').doc('autoReport');
        const stateSnap = await stateRef.get();
        const lastSent = stateSnap.exists ? stateSnap.data()?.lastDailyReportDate : null;

        if (lastSent !== todayKey) {
          await stateRef.set({ lastDailyReportDate: todayKey }, { merge: true });
          const adminIds = await getAllAdminLineIds();
          if (adminIds.length > 0) {
            const [taskText, interactionText] = await Promise.all([
              buildTaskReportText(),
              buildInteractionReportText('all'),
            ]);
            const messages: line.messagingApi.Message[] = [
              { type: 'text', text: `🔔 Báo cáo tự động mỗi sáng\n\n${taskText}` },
              { type: 'text', text: interactionText },
            ];
            for (const adminId of adminIds) {
              try {
                await lineClient.pushMessage({ to: adminId, messages });
                autoReportSent = true;
              } catch (e) {
                console.error('Failed to push auto daily report', adminId, e);
              }
            }
          }
        }
      }
    } catch (e) {
      console.error('Failed to build/send auto daily report', e);
    }

    // 4. Báo cáo tiến độ công việc theo từng nhóm, 2 lần/ngày lúc 14h và 20h30 giờ VN (chỉ tính việc
    // tạo trong hôm nay). Dùng cùng cơ chế chốt "đã gửi slot này hôm nay chưa" như báo cáo hằng ngày ở trên.
    let groupReportsSent = 0;
    try {
      const vnDate = new Date(now + 7 * 60 * 60 * 1000);
      const vnHour = vnDate.getUTCHours();
      const vnMinute = vnDate.getUTCMinutes();
      const todayKey = getVnDateKey(now);

      let slot: ProgressSlot | null = null;
      if (vnHour === 14) slot = 'noon';
      else if (vnHour === 20 && vnMinute >= 30) slot = 'evening';

      if (slot) {
        const stateRef = adminDb.collection('systemState').doc('groupProgressReport');
        const stateSnap = await stateRef.get();
        const fieldName = slot === 'noon' ? 'lastNoonDate' : 'lastEveningDate';
        const lastSent = stateSnap.exists ? stateSnap.data()?.[fieldName] : null;

        if (lastSent !== todayKey) {
          await stateRef.set({ [fieldName]: todayKey }, { merge: true });
          groupReportsSent = await sendGroupProgressReports(adminDb, lineClient, slot, now);
        }
      }
    } catch (e) {
      console.error('Failed to send group progress reports', e);
    }

    return NextResponse.json({
      success: true,
      processedTasks: tasksToNotify.length,
      overdueTasks: tasksToEscalate.length,
      escalatedTasks: escalatedCount,
      remindedTasks: remindedCount,
      resentTasks: tasksToResend.length,
      processedKeywords: keywordsToNotify.length,
      autoReportSent,
      groupReportsSent,
      timestamp: now
    });

  } catch (err: any) {
    console.error('Cron error', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
