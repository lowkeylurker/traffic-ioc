import mongoose, { Schema, Document } from 'mongoose';

export interface ICorridorAnalytics extends Document {
  corridorKey: string | null; // null means all corridors
  date: string; // YYYY-MM-DD
  data: any;
  updatedAt: Date;
}

const CorridorAnalyticsSchema: Schema = new Schema(
  {
    corridorKey: { type: String, default: null, index: true },
    date: { type: String, required: true, index: true },
    data: { type: Schema.Types.Mixed, required: true },
  },
  {
    timestamps: true,
    collection: 'corridor-analytics-per-day',
  }
);

// Compound index for fast lookup
CorridorAnalyticsSchema.index({ corridorKey: 1, date: 1 }, { unique: true });

export const CorridorAnalytics = mongoose.model<ICorridorAnalytics>(
  'CorridorAnalytics',
  CorridorAnalyticsSchema
);
