import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import dbConnect from '@/lib/dbConnect';
import User from '@/models/User';
import { authOptions } from '../../auth/[...nextauth]/route';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await dbConnect();
  const user = await User.findById(session.user.id);
  
  // Check for gmail scope in accounts collection
  const mongoose = (await import('mongoose')).default;
  const account = await mongoose.connection.db?.collection('accounts').findOne({ 
    userId: new mongoose.Types.ObjectId(session.user.id),
    provider: 'google'
  });

  const hasGmailScope = account?.scope?.includes('https://www.googleapis.com/auth/gmail.readonly');

  if (!user) {
    return NextResponse.json({
      googleTokens: null,
      pushSubscription: null,
      hasGmailScope
    });
  }
  
  const userData = user.toObject();
  return NextResponse.json({ ...userData, hasGmailScope });
}
