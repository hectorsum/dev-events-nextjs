import EventCard from '@/components/EventCard'
import ExploreBtn from '@/components/ExploreBtn'
import { IEvent } from '@/database'
import { cacheLife } from 'next/cache';

import React from 'react'
// import events from '@/lib/constants'

// const events = [
//   {image: '/images/event1.png', title:'Event 1', slug: 'event-1', location: 'location-1', date: 'Date-1', time: 'Time-1'},
//   {image: '/images/event2.png', title:'Event 2', slug: 'event-1', location: 'location-1', date: 'Date-1', time: 'Time-1'},
// ]
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;
const Page = async () => {
  'use cache';

  cacheLife('hours');

  let events = [];
  
  try {
    if (!BASE_URL) {
      throw new Error('BASE_URL is not configured');
    }
    
    const response = await fetch(`${BASE_URL}/api/events`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch events: ${response.status}`);
    }
    
    const data = await response.json();
    events = data.events || [];
  } catch (error) {
    console.error('Error fetching events:', error);
    // events remains empty array, allowing graceful degradation
  }

  return (
    <section>
      <h1 className="text-center">
        The Hub for Every Dev <br/> Event You Can't Miss
      </h1>
      <p className='text-center mt-5'>Hackathons, Meetups, and Conferences, All in One Place</p>
      <ExploreBtn/>
      <div className='mt-20 space-y-7' id='events'>
        <h3>Featured Events</h3>
        <ul className='events'>
          {events && events.length > 0 && events.map((event: IEvent) => (
            <li key={event.slug} className='list-none'>
              <EventCard {...event} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

export default Page