import { NextResponse } from 'next/server';

export async function POST(req) {
  try {
    const body = await req.json();
    const customHeaderKey = req.headers.get('x-suno-api-key');
    const apiKey = (customHeaderKey && customHeaderKey.trim() !== '') 
      ? customHeaderKey.trim() 
      : process.env.SUNO_API_KEY;

    console.log('--- Music Generation Proxy Request ---');
    console.log('Prompt:', body.prompt);
    console.log('Custom Mode:', body.customMode);
    console.log('Instrumental:', body.instrumental);
    console.log('Model:', body.model);
    console.log('API Key configured:', apiKey ? `Yes (${apiKey.substring(0, 10)}...)` : 'No');

    if (!apiKey) {
      console.log('Error: API Key is missing');
      return NextResponse.json({
        code: 400,
        msg: 'Suno API Key is required. Please set it in the UI settings or server environment.'
      }, { status: 400 });
    }

    const payload = {
      prompt: body.prompt,
      customMode: !!body.customMode,
      instrumental: !!body.instrumental,
      title: body.title,
      style: body.style,
      model: body.model || 'V4_5ALL',
      callBackUrl: body.callBackUrl || 'https://example.com/suno-callback'
    };

    console.log('Forwarding payload to sunoapi.org...');
    const response = await fetch('https://api.sunoapi.org/api/v1/generate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    console.log('Response from sunoapi.org:', JSON.stringify(data, null, 2));
    console.log('--------------------------------------');

    return NextResponse.json(data);
  } catch (error) {
    console.error('Generation API Route error:', error);
    return NextResponse.json({ code: 500, msg: error.message }, { status: 500 });
  }
}

