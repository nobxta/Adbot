import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';

const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000';

export async function POST(request: NextRequest) {
  try {
    await requireRole(request, ['ADMIN']);

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'File is required' },
        { status: 400 }
      );
    }

    // Read file content
    const fileContent = await file.text();
    let pairs: Array<{ api_id: string; api_hash: string }> = [];

    // Try to parse as JSON first
    try {
      const jsonData = JSON.parse(fileContent);
      if (Array.isArray(jsonData)) {
        pairs = jsonData;
      } else if (jsonData.pairs && Array.isArray(jsonData.pairs)) {
        pairs = jsonData.pairs;
      } else {
        throw new Error('Invalid JSON format');
      }
    } catch {
      // If not JSON, try various text formats
      const lines = fileContent.split('\n').filter(line => line.trim());
      
      if (lines.length === 0) {
        throw new Error('File is empty');
      }
      
      // Check if first line looks like CSV headers
      const firstLine = lines[0].toLowerCase();
      const hasHeaders = firstLine.includes('api_id') && (firstLine.includes('api_hash') || firstLine.includes('hash'));
      
      if (hasHeaders && firstLine.includes(',')) {
        // CSV with headers
        const headers = firstLine.split(',').map(h => h.trim());
        const apiIdIndex = headers.indexOf('api_id');
        const apiHashIndex = headers.findIndex(h => h.includes('hash') || h === 'api_hash');
        
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',').map(v => v.trim());
          if (values[apiIdIndex] && values[apiHashIndex]) {
            pairs.push({
              api_id: values[apiIdIndex],
              api_hash: values[apiHashIndex],
            });
          }
        }
      } else {
        // Try space/tab/comma separated (no headers)
        for (const line of lines) {
          // Try comma first
          if (line.includes(',')) {
            const parts = line.split(',').map(p => p.trim());
            if (parts.length >= 2) {
              pairs.push({
                api_id: parts[0],
                api_hash: parts[1],
              });
            }
          } else {
            // Try space or tab separated
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 2) {
              pairs.push({
                api_id: parts[0],
                api_hash: parts[1],
              });
            }
          }
        }
      }
    }

    if (pairs.length === 0) {
      return NextResponse.json(
        { error: 'No valid API pairs found in file' },
        { status: 400 }
      );
    }

    // Validate pairs
    const validPairs = pairs.filter(p => {
      return p.api_id && p.api_hash && 
             /^\d+$/.test(p.api_id) && 
             /^[0-9a-f]+$/i.test(p.api_hash);
    });

    if (validPairs.length === 0) {
      return NextResponse.json(
        { error: 'No valid API pairs found. api_id must be numeric, api_hash must be hexadecimal' },
        { status: 400 }
      );
    }

    const token = request.headers.get('Authorization') || '';
    
    // Add pairs one by one
    const results = {
      success: 0,
      failed: 0,
      errors: [] as string[],
    };

    for (const pair of validPairs) {
      try {
        const response = await fetch(`${PYTHON_BACKEND_URL}/api/admin/api-pairs/add`, {
          method: 'POST',
          headers: {
            'Authorization': token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(pair),
        });

        if (response.ok) {
          results.success++;
        } else {
          const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
          results.failed++;
          const errorMsg = error.detail || error.error || 'Failed to add';
          // Check if it's a duplicate (409) or other error
          if (response.status === 409) {
            results.errors.push(`${pair.api_id}: Already exists (duplicate)`);
          } else if (response.status === 400) {
            results.errors.push(`${pair.api_id}: Invalid format - ${errorMsg}`);
          } else {
            results.errors.push(`${pair.api_id}: ${errorMsg}`);
          }
        }
      } catch (error) {
        results.failed++;
        results.errors.push(`${pair.api_id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
    
    return NextResponse.json({
      success: true,
      message: `Uploaded ${results.success} API pairs successfully. ${results.failed} failed.`,
      data: results,
    });
  } catch (error) {
    console.error('Error bulk uploading API pairs:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message === 'Unauthorized' || message === 'Forbidden' ? 403 : 500;
    
    return NextResponse.json({ error: message }, { status });
  }
}

