import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IUser extends Document {
  googleTokens?: {
    accessToken: string;
    refreshToken: string;
    expiry: Date;
  };
  pushSubscription?: {
    endpoint: string;
    keys: {
      p256dh: string;
      auth: string;
    };
  };
  preferences: {
    enablePush: boolean;
    reminderDaysBefore: number;
  };
  createdAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    googleTokens: {
      accessToken: String,
      refreshToken: String,
      expiry: Date,
    },
    pushSubscription: {
      endpoint: String,
      keys: {
        p256dh: String,
        auth: String,
      },
    },
    preferences: {
      enablePush: { type: Boolean, default: true },
      reminderDaysBefore: { type: Number, default: 1 },
    },
  },
  { timestamps: true }
);

const User: Model<IUser> =
  mongoose.models.User || mongoose.model<IUser>('User', UserSchema);

export default User;
