import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ISubscription extends Document {
  userId: mongoose.Types.ObjectId;
  serviceName: string;
  cost: number;
  currency: string;
  billingCycle: 'Monthly' | 'Yearly' | 'Weekly';
  nextRenewalDate: Date;
  status: 'Active' | 'Cancelled' | 'Paused';
  cancellationUrl?: string;
  notes?: string;
  category?: string;
  createdAt: Date;
}

const SubscriptionSchema = new Schema<ISubscription>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    serviceName: { type: String, required: true },
    cost: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    billingCycle: {
      type: String,
      enum: ['Monthly', 'Yearly', 'Weekly'],
      default: 'Monthly',
    },
    nextRenewalDate: { type: Date, required: true },
    status: {
      type: String,
      enum: ['Active', 'Cancelled', 'Paused'],
      default: 'Active',
    },
    cancellationUrl: { type: String },
    notes: { type: String },
    category: { type: String },
  },
  { timestamps: true }
);

const Subscription: Model<ISubscription> =
  mongoose.models.Subscription ||
  mongoose.model<ISubscription>('Subscription', SubscriptionSchema);

export default Subscription;
