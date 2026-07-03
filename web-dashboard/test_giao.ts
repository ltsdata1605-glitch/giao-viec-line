import { handleGiaoCommand } from './src/lib/bot/tasks';

async function test() {
  const event: any = {
    type: 'message',
    replyToken: 'dummy',
    source: { type: 'user', userId: 'U123456789' },
    message: { type: 'text', text: '/giao Test task @Nam' }
  };
  
  const client: any = {
    replyMessage: async (res: any) => console.log('Mock reply:', JSON.stringify(res))
  };

  try {
    await handleGiaoCommand('/giao Test task @Nam', event, client);
    console.log('Test success!');
  } catch (err) {
    console.error('Test error:', err);
  }
}
test();
