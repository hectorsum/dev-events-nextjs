import { Event } from "@/database";
import connectDB from "@/lib/mongodb";
import { NextRequest, NextResponse } from "next/server";

// Type for route context params
type RouteContext = {
  params: Promise<{ slug: string }>;
};

/**
 * GET /api/events/[slug]
 * Fetches a single event by its slug
 */
export async function GET(
  req: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    // Extract slug from route params
    const { slug } = await context.params;

    // Validate slug exists
    if (!slug) {
      return NextResponse.json(
        { message: "Slug parameter is required" },
        { status: 400 }
      );
    }

    // Validate slug format (alphanumeric and hyphens only)
    const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    if (!slugRegex.test(slug)) {
      return NextResponse.json(
        { 
          message: "Invalid slug format. Slug must contain only lowercase letters, numbers, and hyphens." 
        },
        { status: 400 }
      );
    }

    // Connect to database
    await connectDB();

    // Query event by slug
    const event = await Event.findOne({ slug }).lean().exec();

    // Handle event not found
    if (!event) {
      return NextResponse.json(
        { message: `Event with slug '${slug}' not found` },
        { status: 404 }
      );
    }

    // Return successful response
    return NextResponse.json(
      { 
        message: "Event fetched successfully", 
        event: event 
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    // Log error for debugging (in production, use proper logging service)
    console.error("Error fetching event by slug:", error);

    // Handle MongoDB connection errors
    if (error instanceof Error && error.message.includes("connect")) {
      return NextResponse.json(
        { message: "Database connection failed" },
        { status: 503 }
      );
    }

    // Handle unexpected errors
    return NextResponse.json(
      { 
        message: "Failed to fetch event"
      },
      { status: 500 }
    );
  }
}
