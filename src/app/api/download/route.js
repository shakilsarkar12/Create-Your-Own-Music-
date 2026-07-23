import { NextResponse } from 'next/server';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const url = searchParams.get('url');
    const title = searchParams.get('title') || 'song';

    if (!url) {
      return NextResponse.json({ error: 'url parameter is required' }, { status: 400 });
    }

    console.log(`Downloading audio from: ${url}`);
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch remote audio file: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const headers = new Headers();
    
    // Set attachment header to force download with custom title
    const safeTitle = title.replace(/[^a-zA-Z0-9 Bengali\u0980-\u09FF\s-_]/g, '');
    headers.set('Content-Disposition', `attachment; filename="${encodeURIComponent(safeTitle || 'song')}.mp3"`);
    headers.set('Content-Type', 'audio/mpeg');

    return new NextResponse(Buffer.from(arrayBuffer), {
      status: 200,
      headers
    });
  } catch (error) {
    console.error('Download proxy error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
