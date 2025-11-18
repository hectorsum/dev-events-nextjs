import { Event } from "@/database";
import connectDB from "@/lib/mongodb";
import { NextRequest, NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";

const ALLOWED_MODES = ["online", "offline", "hybrid"] as const;

type SanitizedEvent = {
  title: string;
  description: string;
  overview: string;
  venue: string;
  location: string;
  date: string;
  time: string;
  mode: (typeof ALLOWED_MODES)[number];
  audience: string;
  agenda: string[];
  organizer: string;
  tags: string[];
  image: string;
};

const TEXT_FIELD_LIMITS: Record<
  keyof Omit<SanitizedEvent, "date" | "time" | "mode" | "agenda" | "tags" | "image">,
  { maxLength: number }
> = {
  title: { maxLength: 100 },
  description: { maxLength: 1000 },
  overview: { maxLength: 500 },
  venue: { maxLength: 100 },
  location: { maxLength: 150 },
  audience: { maxLength: 150 },
  organizer: { maxLength: 150 },
};

function sanitizePlainText(value: string, maxLength: number) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  return trimmed.replace(/[<>]/g, "").slice(0, maxLength);
}

function normalizeDate(value: string) {
  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return parsedDate.toISOString().split("T")[0];
}

function normalizeTime(value: string) {
  const timeRegex = /^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i;
  const match = value.trim().match(timeRegex);
  if (!match) {
    return null;
  }

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = match[3]?.toUpperCase();

  if (period) {
    if (period === "PM" && hours !== 12) hours += 12;
    if (period === "AM" && hours === 12) hours = 0;
  }

  if (hours > 23 || minutes > 59) {
    return null;
  }

  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
}

function parseStringArray(value: string) {
  let candidate: unknown;
  try {
    candidate = JSON.parse(value);
  } catch {
    candidate = value.includes(",") ? value.split(",") : [value];
  }

  if (!Array.isArray(candidate)) {
    return null;
  }

  const sanitizedArray = candidate
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .map((item) => item.replace(/[<>]/g, ""));

  return sanitizedArray.length ? sanitizedArray : null;
}

function ensureSecureImageUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function validateAndSanitizeEvent(raw: Record<string, FormDataEntryValue | string>): {
  sanitizedEvent?: SanitizedEvent;
  errors: string[];
} {
  const errors: string[] = [];
  const sanitized: Partial<SanitizedEvent> = {};

  (Object.keys(TEXT_FIELD_LIMITS) as (keyof typeof TEXT_FIELD_LIMITS)[]).forEach((field) => {
    const rawValue = raw[field];
    if (typeof rawValue !== "string") {
      errors.push(`${field} is required`);
      return;
    }

    const cleanValue = sanitizePlainText(rawValue, TEXT_FIELD_LIMITS[field].maxLength);
    if (!cleanValue) {
      errors.push(`${field} cannot be empty`);
      return;
    }

    sanitized[field] = cleanValue as SanitizedEvent[typeof field];
  });

  const rawDate = raw.date;
  if (typeof rawDate !== "string") {
    errors.push("date is required");
  } else {
    const normalizedDate = normalizeDate(rawDate);
    if (!normalizedDate) {
      errors.push("date must be a valid date");
    } else {
      sanitized.date = normalizedDate;
    }
  }

  const rawTime = raw.time;
  if (typeof rawTime !== "string") {
    errors.push("time is required");
  } else {
    const normalizedTime = normalizeTime(rawTime);
    if (!normalizedTime) {
      errors.push("time must be in HH:MM or HH:MM AM/PM format");
    } else {
      sanitized.time = normalizedTime;
    }
  }

  const rawMode = typeof raw.mode === "string" ? raw.mode.trim().toLowerCase() : "";
  if (!ALLOWED_MODES.includes(rawMode as (typeof ALLOWED_MODES)[number])) {
    errors.push(`mode must be one of: ${ALLOWED_MODES.join(", ")}`);
  } else {
    sanitized.mode = rawMode as SanitizedEvent["mode"];
  }

  const rawAgenda = typeof raw.agenda === "string" ? raw.agenda : "";
  const agendaArray = rawAgenda ? parseStringArray(rawAgenda) : null;
  if (!agendaArray) {
    errors.push("agenda must be an array of strings with at least one item");
  } else {
    sanitized.agenda = agendaArray;
  }

  const rawTags = typeof raw.tags === "string" ? raw.tags : "";
  const tagsArray = rawTags ? parseStringArray(rawTags) : null;
  if (!tagsArray) {
    errors.push("tags must be an array of strings with at least one item");
  } else {
    sanitized.tags = tagsArray;
  }

  const rawImage = typeof raw.image === "string" ? raw.image : "";
  const secureImage = ensureSecureImageUrl(rawImage);
  if (!secureImage) {
    errors.push("image must be a valid HTTPS URL");
  } else {
    sanitized.image = secureImage;
  }

  return {
    errors,
    sanitizedEvent: errors.length ? undefined : (sanitized as SanitizedEvent),
  };
}

export async function POST(req: NextRequest){
  try {
    await connectDB();
    console.log("connected!!!");
    const formData = await req.formData();
    let event;

    try {
      event = Object.fromEntries(formData.entries());
    } catch (e) {
      return NextResponse.json({message: 'Invalid form data'}, {status: 400});
    }

    const file = formData.get('image') as File;
    if (!file){
      return NextResponse.json({message: 'Image file is required'}, {status: 400});
    }

    let tags = JSON.parse(formData.get('tags') as string);
    let agenda = JSON.parse(formData.get('agenda') as string);

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({message: 'Invalid file type. Only images are allowed'}, {status: 400});
    }

    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      return NextResponse.json({message: 'File size exceeds 5MB limit'}, {status: 400});
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const uploadResult = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream({ resource_type: 'image', folder: 'DevEvent' }, (error, results) => {
        if (error) return reject(error);

        resolve(results);
      }).end(buffer);
    })

    event.image = (uploadResult as { secure_url: string }).secure_url;

    const { sanitizedEvent, errors } = validateAndSanitizeEvent(event);
    if (!sanitizedEvent) {
      return NextResponse.json(
        { message: "Validation failed", errors },
        { status: 400 }
      );
    }

    let createdEvent;
    try {
      createdEvent = await Event.create({
        ...sanitizedEvent,
        tags: tags,
        agenda: agenda
      });
    } catch (dbError) {
      console.error(dbError);
      return NextResponse.json(
        {
          message: "Event Creation Failed",
          error: dbError instanceof Error ? dbError.message : "Unknown database error",
        },
        { status: 500 }
      );
    }
    return NextResponse.json({message: 'Event Created Successfully', event: createdEvent}, {status: 201});
  } catch (e) {
    console.log(e);
    return NextResponse.json({message: 'Event Creation Failed', error: e instanceof Error ? e.message : 'Unknown'}, {status: 500});
  }
}

export async function GET(req: NextRequest){
  try {
    await connectDB();
    
    // Extract and parse pagination parameters from query string
    const searchParams = req.nextUrl.searchParams;
    const limitParam = searchParams.get('limit');
    const pageParam = searchParams.get('page');
    
    // Parse limit with default 20, validate between 1 and 100
    let limit = 20;
    if (limitParam !== null) {
      const parsedLimit = parseInt(limitParam, 10);
      if (!isNaN(parsedLimit)) {
        limit = Math.max(1, Math.min(100, parsedLimit));
      }
    }
    
    // Parse page with default 0, validate >= 0
    let page = 0;
    if (pageParam !== null) {
      const parsedPage = parseInt(pageParam, 10);
      if (!isNaN(parsedPage)) {
        page = Math.max(0, parsedPage);
      }
    }
    
    const events = await Event.find()
      .sort({createdAt: -1})
      .limit(limit)
      .skip(page * limit);
    
    return NextResponse.json({message: 'Events fetched successfully', events}, {status: 200});
  } catch (e) {
    return NextResponse.json({ message: 'Event fetching failed', error: e }, {status: 500});
  }
}