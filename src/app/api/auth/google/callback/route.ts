import { NextRequest, NextResponse } from 'next/server';
import { oauth2Client } from '@/lib/googleAuth';
import dbConnect from '@/lib/dbConnect';
import User from '@/models/User';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.json({ error: 'No code provided' }, { status: 400 });
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    await dbConnect();

    // For a single user app, we just find or create the first user
    let user = await User.findOne({});
    if (!user) {
      user = new User({
        preferences: { enablePush: true, reminderDaysBefore: 1 },
      });
    }

    user.googleTokens = {
      accessToken: tokens.access_token!,
      refreshToken: tokens.refresh_token!,
      expiry: new Date(tokens.expiry_date!),
    };

    await user.save();

    // Redirect back to settings page (which we will create)
    return NextResponse.redirect(new URL('/settings?connected=true', req.url));
  } catch (error: any) {
    console.error('OAuth Error:', error);
    return NextResponse.redirect(new URL('/settings?error=oauth', req.url));
  }
}
