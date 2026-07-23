import { NextResponse } from 'next/server';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const taskId = searchParams.get('taskId');
    if (!taskId) {
      return NextResponse.json({ code: 400, msg: 'taskId parameter is required.' }, { status: 400 });
    }

    const customHeaderKey = req.headers.get('x-suno-api-key');
    const apiKey = (customHeaderKey && customHeaderKey.trim() !== '') 
      ? customHeaderKey.trim() 
      : process.env.SUNO_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ code: 400, msg: 'Suno API Key is required.' }, { status: 400 });
    }

    const response = await fetch(`https://api.sunoapi.org/api/v1/lyrics/record-info?taskId=${taskId}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Lyrics status API Route error:', error);
    return NextResponse.json({ code: 500, msg: error.message }, { status: 500 });
  }
}
