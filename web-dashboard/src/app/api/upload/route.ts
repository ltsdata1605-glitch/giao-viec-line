import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const image = formData.get('image');

    if (!image) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    }

    // Sử dụng Catbox.moe (Lưu trữ ảnh miễn phí 100%, không cần API Key, không giới hạn rate limit)
    const catboxFormData = new FormData();
    catboxFormData.append('reqtype', 'fileupload');
    catboxFormData.append('fileToUpload', image);

    const catboxResponse = await fetch('https://catbox.moe/user/api.php', {
      method: 'POST',
      body: catboxFormData,
    });

    if (!catboxResponse.ok) {
      return NextResponse.json({ error: 'Máy chủ ảnh từ chối kết nối' }, { status: 500 });
    }

    const url = await catboxResponse.text();
    
    if (url && url.startsWith('http')) {
      return NextResponse.json({ url: url.trim() });
    } else {
      return NextResponse.json({ error: 'Lỗi phản hồi từ máy chủ ảnh' }, { status: 500 });
    }
  } catch (error) {
    console.error('Upload API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
