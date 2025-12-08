// run: node get_refresh_token.js
import { google } from 'googleapis';
import open from 'open';
import readline from 'readline';
import dotenv from 'dotenv';
dotenv.config();

const CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:3000/oauth2callback'; // must match credential

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'email',
  'profile'
];

async function getRefreshToken() {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',   // important — gives a refresh token
    scope: SCOPES
  });

  console.log('Open this URL in your browser:\n', authUrl);
  await open(authUrl);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question('Paste the code from the URL here: ', async (code) => {
    rl.close();
    try {
      const { tokens } = await oauth2Client.getToken(code.trim());
      console.log('Tokens:', tokens);
      console.log('\nSave these to your environment variables:');
      console.log('REFRESH_TOKEN =', tokens.refresh_token);
      console.log('ACCESS_TOKEN  =', tokens.access_token);
      console.log('EXPIRES_IN    =', tokens.expires_in);
    } catch (err) {
      console.error('Error while trying to retrieve access token', err);
    }
    process.exit();
  });
}

getRefreshToken();
