import { NextResponse } from 'next/server';

export async function POST(req) {
  try {
    const body = await req.json();
    const customHeaderKey = req.headers.get('x-suno-api-key');
    const apiKey = (customHeaderKey && customHeaderKey.trim() !== '') 
      ? customHeaderKey.trim() 
      : process.env.SUNO_API_KEY;

    console.log('--- Lyrics Generation Proxy Request ---');
    console.log('Prompt:', body.prompt);
    console.log('API Key configured:', apiKey ? `Yes (${apiKey.substring(0, 10)}...)` : 'No');

    if (!apiKey) {
      console.log('Error: API Key is missing');
      return NextResponse.json({ code: 400, msg: 'Suno API Key is required.' }, { status: 400 });
    }

    if (!body.prompt) {
      console.log('Error: prompt is missing');
      return NextResponse.json({ code: 400, msg: 'prompt is required for generating lyrics.' }, { status: 400 });
    }

    console.log('Forwarding payload to sunoapi.org lyrics...');
    const response = await fetch('https://api.sunoapi.org/api/v1/lyrics', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt: body.prompt,
        callBackUrl: body.callBackUrl || 'https://example.com/suno-callback'
      })
    });

    const data = await response.json();
    console.log('Response from sunoapi.org lyrics:', JSON.stringify(data, null, 2));
    console.log('--------------------------------------');

    return NextResponse.json(data);
  } catch (error) {
    console.error('Lyrics generation API Route error:', error);
    return NextResponse.json({ code: 500, msg: error.message }, { status: 500 });
  }
}

