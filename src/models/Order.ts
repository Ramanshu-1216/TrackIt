import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IOrder extends Document {
  orderId?: string;
  userId: mongoose.Types.ObjectId;
  itemName: string;
  productId?: string;
  marketplace: string;
  purchaseDate: Date;
  deliveryDate?: Date;
  orderAmount?: number;
  returnWindowDays: number | null;
  returnDeadline: Date;
  returnable?: boolean;
  replaceable?: boolean;
  returnPolicyDetails?: string;
  status: 'Pending' | 'Shipped' | 'Out for delivery' | 'Delivered' | 'Returned' | 'Kept';
  productUrl?: string;
  gmailMessageId?: string;
  notes?: string;
  createdAt: Date;
}

const OrderSchema = new Schema<IOrder>(
  {
    orderId: { type: String },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    itemName: { type: String, required: true },
    productId: { type: String },
    marketplace: { type: String, required: true },
    purchaseDate: { type: Date, required: true },
    deliveryDate: { type: Date, required: false },
    orderAmount: { type: Number },
    returnWindowDays: { type: Number, default: 7 },
    returnDeadline: { type: Date },
    returnable: { type: Boolean, default: false },
    replaceable: { type: Boolean, default: false },
    returnPolicyDetails: { type: String },
    status: {
      type: String,
      enum: ['Pending', 'Shipped', 'Out for delivery', 'Delivered', 'Returned', 'Kept'],
      default: 'Pending',
    },
    gmailMessageId: { type: String },
    notes: { type: String },
  },
  { timestamps: true }
);

// Compound unique index to prevent duplicate products in the same order
OrderSchema.index({ userId: 1, marketplace: 1, orderId: 1, productId: 1 }, { unique: true });

// Auto-compute returnDeadline before saving
OrderSchema.pre('save', async function (this: IOrder) {
  if (this.deliveryDate && this.returnWindowDays) {
    const deadline = new Date(this.deliveryDate);
    deadline.setDate(deadline.getDate() + this.returnWindowDays);
    this.returnDeadline = deadline;
  }
});

const Order: Model<IOrder> =
  mongoose.models.Order || mongoose.model<IOrder>('Order', OrderSchema);

export default Order;
