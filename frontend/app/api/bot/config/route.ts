import { NextRequest, NextResponse } from 'next/server';
import { getUserById } from '@/lib/db';
import { backendApi } from '@/lib/backend-api';

// Get bot configuration (for Telethon) - DEPRECATED: Use /api/user/advertisement instead
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    const { searchParams } = new URL(request.url);
    const requestedUserId = searchParams.get('userId') || userId;

    if (!requestedUserId) {
      return NextResponse.json(
        { error: 'User ID required' },
        { status: 400 }
      );
    }

    // Get bot state from Python backend
    try {
      const state = await backendApi.getState(requestedUserId);
      
      // Map Python backend fields to legacy format
      const postType = state.post_type || 'link';
      const postContent = state.post_content || '';
      
      return NextResponse.json({
        userId: requestedUserId,
        postLink: postType === 'link' ? postContent : null,
        customText: postType === 'text' ? postContent : null,
        advertisementType: postType,
        groupIds: state.groups || [],
        botStatus: state.status || 'inactive',
      });
    } catch (backendError: any) {
      if (backendError.message?.includes('not found')) {
        return NextResponse.json(
          { error: 'Bot configuration not found' },
          { status: 404 }
        );
      }
      throw backendError;
    }
  } catch (error) {
    console.error('Error fetching bot config:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Save bot configuration - DEPRECATED: Use /api/user/advertisement instead
export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    const body = await request.json();
    const { postLink, customText, advertisementType, groupIds } = body;

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID required' },
        { status: 401 }
      );
    }

    const user = await getUserById(userId);
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Update post content if provided
    if (advertisementType && (postLink || customText)) {
      const postType = advertisementType === 'link' ? 'link' : 'text';
      const postContent = postType === 'link' ? postLink : customText;
      
      try {
        await backendApi.updatePost(userId, postType, postContent);
      } catch (backendError: any) {
        return NextResponse.json(
          { error: backendError.message || 'Failed to update post content' },
          { status: 502 }
        );
      }
    }

    // Update groups if provided
    if (groupIds && Array.isArray(groupIds)) {
      try {
        await backendApi.updateGroups(userId, groupIds);
      } catch (backendError: any) {
        return NextResponse.json(
          { error: backendError.message || 'Failed to update groups' },
          { status: 502 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Bot configuration saved',
    });
  } catch (error) {
    console.error('Error saving bot config:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

