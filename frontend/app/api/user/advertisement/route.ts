import { NextRequest, NextResponse } from 'next/server';
import { getUserById } from '@/lib/db';
import { backendApi } from '@/lib/backend-api';
import { supabaseAdmin } from '@/lib/supabase';

// Get advertisement configuration
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID required' },
        { status: 400 }
      );
    }

    const user = await getUserById(userId);

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Get adbot post_link from database first (source of truth)
    const { data: adbotData } = await supabaseAdmin
      .from('adbots')
      .select('post_link')
      .eq('user_id', userId)
      .eq('deleted_state', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Database is source of truth - if we have post_link in database, determine type
    if (adbotData?.post_link) {
      // Check if it's a URL (link) or custom text
      const isUrl = /^https?:\/\//.test(adbotData.post_link.trim());
      
      return NextResponse.json({
        config: {
          postLink: isUrl ? adbotData.post_link : null,
          customText: !isUrl ? adbotData.post_link : null,
          type: isUrl ? 'link' : 'text',
          groupIds: [],
        },
      });
    }

    // If no database entry, try Python backend as fallback
    let postLink = null;
    let postType = 'link';
    let postContent = '';
    let groupIds: string[] = [];

    try {
      const state = await backendApi.getState(userId);
      postType = state.post_type || 'link';
      postContent = state.post_content || '';
      groupIds = state.groups || [];
      
      if (postContent) {
        postLink = postType === 'link' ? postContent : null;
      }
    } catch (backendError: any) {
      // Backend not available or user not registered - return empty config
      // This is fine, user can set it later
      console.log('Backend not available, returning empty config:', backendError.message);
    }
    
    return NextResponse.json({
      config: {
        postLink: postType === 'link' ? postLink : null,
        customText: postType === 'text' ? postContent : null,
        type: postLink || postContent ? postType : null,
        groupIds,
      },
    });
  } catch (error) {
    console.error('Error fetching advertisement config:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Save advertisement configuration
export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    const body = await request.json();
    const { postLink, customText, type } = body;

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID required' },
        { status: 401 }
      );
    }

    if (!type || (type !== 'link' && type !== 'text')) {
      return NextResponse.json(
        { error: 'Invalid advertisement type' },
        { status: 400 }
      );
    }

    if (type === 'link' && !postLink?.trim()) {
      return NextResponse.json(
        { error: 'Post link is required' },
        { status: 400 }
      );
    }

    if (type === 'text' && !customText?.trim()) {
      return NextResponse.json(
        { error: 'Custom text is required' },
        { status: 400 }
      );
    }

    // Get user info for validation
    const user = await getUserById(userId);
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Get adbot ID for this user
    const { data: adbotData } = await supabaseAdmin
      .from('adbots')
      .select('id')
      .eq('user_id', userId)
      .eq('deleted_state', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!adbotData) {
      return NextResponse.json(
        { error: 'Adbot not found for this user' },
        { status: 404 }
      );
    }

    // Update post content in Python backend
    const postContent = type === 'link' ? postLink : customText;
    
    try {
      await backendApi.updatePost(userId, type, postContent);
    } catch (backendError: any) {
      console.error('Backend API error:', backendError);
      // Continue to save to database even if backend fails
    }

    // Update post_link or custom text in Supabase adbots table
    // Note: For custom text, we store it in post_link field as well (or we could add a custom_text field)
    const contentToSave = type === 'link' ? postLink : customText;
    
    if (contentToSave) {
      const updateData: any = {
        updated_at: new Date().toISOString()
      };
      
      if (type === 'link') {
        updateData.post_link = postLink;
      } else {
        // For custom text, we'll store it in post_link for now
        // TODO: Consider adding a custom_text field to adbots table
        updateData.post_link = customText;
      }

      const { error: updateError } = await supabaseAdmin
        .from('adbots')
        .update(updateData)
        .eq('id', adbotData.id);

      if (updateError) {
        console.error('Error updating advertisement in database:', updateError);
        return NextResponse.json(
          { error: 'Failed to save advertisement to database' },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Advertisement configuration saved',
      config: {
        postLink: type === 'link' ? postLink : undefined,
        customText: type === 'text' ? customText : undefined,
        type,
      },
    });
  } catch (error) {
    console.error('Error saving advertisement config:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

