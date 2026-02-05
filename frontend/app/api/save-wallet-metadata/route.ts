import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const wallet = await request.json();

    // Save wallet to Clerk user metadata
    const client = await clerkClient();
    await client.users.updateUser(userId, {
      publicMetadata: {
        wallet: {
          address: wallet.address,
          walletId: wallet.walletId,
          walletSetId: wallet.walletSetId,
        },
      },
    });

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('Error saving wallet metadata:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to save wallet' },
      { status: 500 }
    );
  }
}