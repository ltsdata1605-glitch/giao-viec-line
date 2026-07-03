import * as line from '@line/bot-sdk';

async function run() {
  const client = new line.messagingApi.MessagingApiClient({
    channelAccessToken: 'your_token'
  });
  // Since we don't have the token, we can just compile it to see if getGroupSummary exists
  console.log(typeof client.getGroupSummary);
}
run();
