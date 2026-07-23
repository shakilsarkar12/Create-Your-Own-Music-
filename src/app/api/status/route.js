import { NextResponse } from 'next/server';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const taskId = searchParams.get('taskId');
    
    console.log('--- Status Polling Proxy Request ---');
    console.log('Task ID:', taskId);
    
    if (!taskId) {
      console.log('Error: Task ID parameter is missing');
      return NextResponse.json({ code: 400, msg: 'taskId parameter is required.' }, { status: 400 });
    }

    const customHeaderKey = req.headers.get('x-suno-api-key');
    const apiKey = (customHeaderKey && customHeaderKey.trim() !== '') 
      ? customHeaderKey.trim() 
      : process.env.SUNO_API_KEY;

    console.log('API Key configured:', apiKey ? `Yes (${apiKey.substring(0, 10)}...)` : 'No');

    if (!apiKey) {
      console.log('Error: API Key is missing');
      return NextResponse.json({ code: 400, msg: 'Suno API Key is required.' }, { status: 400 });
    }

    console.log('Fetching status details from sunoapi.org...');
    const response = await fetch(`https://api.sunoapi.org/api/v1/generate/record-info?taskId=${taskId}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });

    const data = await response.json();
    console.log('Response from sunoapi.org status check:', JSON.stringify(data, null, 2));
    console.log('------------------------------------');

    return NextResponse.json(data);
  } catch (error) {
    console.error('Status API Route error:', error);
    return NextResponse.json({ code: 500, msg: error.message }, { status: 500 });
  }
}

