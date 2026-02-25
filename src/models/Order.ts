import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IOrder extends Document {
  userId: mongoose.Types.ObjectId;
  itemName: string;
  marketplace: string;
  purchaseDate: Date;
  deliveryDate: Date;
  returnWindowDays: number;
  returnDeadline: Date;
  status: 'Pending' | 'Delivered' | 'Returned' | 'Kept';
  gmailMessageId?: string;
  notes?: string;
  createdAt: Date;
}

const OrderSchema = new Schema<IOrder>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    itemName: { type: String, required: true },
    marketplace: { type: String, required: true },
    purchaseDate: { type: Date, required: true },
    deliveryDate: { type: Date, required: false },
    returnWindowDays: { type: Number, required: true, default: 7 },
    returnDeadline: { type: Date },
    status: {
      type: String,
      enum: ['Pending', 'Delivered', 'Returned', 'Kept'],
      default: 'Pending',
    },
    gmailMessageId: { type: String, unique: true, sparse: true },
    notes: { type: String },
  },
  { timestamps: true }
);

// Auto-compute returnDeadline before saving
OrderSchema.pre('save', async function () {
  if (this.deliveryDate && this.returnWindowDays) {
    const deadline = new Date(this.deliveryDate);
    deadline.setDate(deadline.getDate() + this.returnWindowDays);
    this.returnDeadline = deadline;
  }
});

const Order: Model<IOrder> =
  mongoose.models.Order || mongoose.model<IOrder>('Order', OrderSchema);

export default Order;
