'use server'

import { Event, IEventPlain } from "@/database";
import connectDB from "../mongodb"

export const getSimilarEventsBySlug = async (slug: string): Promise<IEventPlain[]> => {
  try {
    await connectDB();
    const event = await Event.findOne({ slug });
    
    if (!event) {
      return [];
    }
    
    const similarEvents = await Event.find({ _id: { $ne: event._id } , tags: { $in: event.tags } } ).lean();
    return similarEvents as unknown as IEventPlain[];
  } catch (error) {
    return [];
  }
}