import { NextRequest, NextResponse } from 'next/server';

// Validate Telegram post link format
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { postLink } = body;

    if (!postLink || typeof postLink !== 'string') {
      return NextResponse.json(
        { error: 'Post link is required' },
        { status: 400 }
      );
    }

    // Telegram post link patterns:
    // https://t.me/channel/123
    // https://t.me/c/channel/123
    // https://telegram.me/channel/123
    const telegramPattern = /^https?:\/\/(t\.me|telegram\.me)\/(c\/)?[a-zA-Z0-9_]+(\/\d+)?$/;
    
    const isValid = telegramPattern.test(postLink.trim());

    // In production, you might want to:
    // 1. Actually check if the post exists
    // 2. Verify the post is accessible
    // 3. Check if it's a public post

    return NextResponse.json({
      valid: isValid,
      message: isValid ? 'Post link is valid' : 'Invalid post link format',
    });
  } catch (error) {
    console.error('Error validating post link:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

