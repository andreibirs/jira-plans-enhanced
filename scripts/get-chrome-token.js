#!/usr/bin/env node
/**
 * Script to generate Chrome Web Store refresh token
 *
 * Usage:
 *   1. Set up OAuth credentials in Google Cloud Console
 *   2. Run: node scripts/get-chrome-token.js
 *   3. Follow the authorization URL in your browser
 *   4. Paste the authorization code when prompted
 */

const http = require('http');
const https = require('https');
const { URL, URLSearchParams } = require('url');
const readline = require('readline');

const REDIRECT_URI = 'http://localhost:8818';
const SCOPES = 'https://www.googleapis.com/auth/chromewebstore';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function prompt(question) {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

async function main() {
  console.log('Chrome Web Store OAuth Token Generator\n');

  // Get credentials from user
  const clientId = await prompt('Enter your Client ID: ');
  const clientSecret = await prompt('Enter your Client Secret: ');

  if (!clientId || !clientSecret) {
    console.error('Error: Client ID and Client Secret are required');
    process.exit(1);
  }

  // Generate authorization URL
  const authUrl = new URL('https://accounts.google.com/o/oauth2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', SCOPES);
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');

  console.log('\n📋 Authorization URL:');
  console.log(authUrl.toString());
  console.log('\n1. Open the URL above in your browser');
  console.log('2. Sign in with your Chrome Web Store publisher account');
  console.log('3. Grant permissions');
  console.log('4. You will be redirected to localhost (may show error page - this is OK)');
  console.log('5. Copy the "code" parameter from the URL\n');

  const code = await prompt('Enter the authorization code: ');

  if (!code) {
    console.error('Error: Authorization code is required');
    process.exit(1);
  }

  rl.close();

  // Exchange code for tokens
  console.log('\n🔄 Exchanging authorization code for refresh token...\n');

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code: code.trim(),
    grant_type: 'authorization_code',
    redirect_uri: REDIRECT_URI,
  });

  const options = {
    hostname: 'oauth2.googleapis.com',
    path: '/token',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': params.toString().length,
    },
  };

  const req = https.request(options, (res) => {
    let data = '';

    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      try {
        const tokens = JSON.parse(data);

        if (tokens.error) {
          console.error('❌ Error:', tokens.error);
          console.error('Description:', tokens.error_description);
          process.exit(1);
        }

        console.log('✅ Success! Your credentials:\n');
        console.log('CHROME_CLIENT_ID:', clientId);
        console.log('CHROME_CLIENT_SECRET:', clientSecret);
        console.log('CHROME_REFRESH_TOKEN:', tokens.refresh_token);
        console.log('\n📝 Add these as secrets to your GitHub repository:');
        console.log('   Settings > Secrets and variables > Actions > New repository secret');
        console.log('\n⚠️  Keep these credentials secure - do not commit them to git!');
      } catch (error) {
        console.error('❌ Failed to parse response:', error.message);
        console.error('Response:', data);
        process.exit(1);
      }
    });
  });

  req.on('error', (error) => {
    console.error('❌ Request failed:', error.message);
    process.exit(1);
  });

  req.write(params.toString());
  req.end();
}

main().catch((error) => {
  console.error('❌ Unexpected error:', error.message);
  process.exit(1);
});
