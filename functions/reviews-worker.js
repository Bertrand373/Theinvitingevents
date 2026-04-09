/*
 * INVITING EVENTS — Google Reviews Worker
 * ========================================
 * This Cloudflare Worker fetches reviews from Google Places API,
 * caches them for 24 hours, and serves them to the website.
 *
 * SETUP:
 * 1. Go to console.cloud.google.com
 * 2. Create a project (or use existing)
 * 3. Enable "Places API (New)" 
 * 4. Create an API key (APIs & Services → Credentials)
 * 5. Restrict the key to Places API only
 * 6. In Cloudflare dashboard → Workers → Create Worker
 * 7. Paste this code
 * 8. Go to Settings → Variables → add secret: GOOGLE_API_KEY = your key
 * 9. Create KV namespace "IE_CACHE" and bind it to this worker
 * 10. Add custom route: theinvitingevents.com/api/reviews
 *
 * COST: $0. Google gives $200/month free credit.
 * This worker makes ~1 API call per day (cached).
 */

const PLACE_ID = 'ChIJUYulZmS69YgRrnj_mGN9Wtc';
const CACHE_KEY = 'google_reviews';
const CACHE_TTL = 86400; // 24 hours in seconds

export default {
  async fetch(request, env) {
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
      'Content-Type': 'application/json',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Check KV cache first
      const cached = await env.IE_CACHE.get(CACHE_KEY, { type: 'json' });
      if (cached && cached.fetchedAt) {
        const age = (Date.now() - cached.fetchedAt) / 1000;
        if (age < CACHE_TTL) {
          return new Response(JSON.stringify(cached), { headers: corsHeaders });
        }
      }

      // Fetch fresh from Google Places API (New)
      const apiKey = env.GOOGLE_API_KEY;
      if (!apiKey) {
        throw new Error('GOOGLE_API_KEY not configured');
      }

      const response = await fetch(
        `https://places.googleapis.com/v1/places/${PLACE_ID}`,
        {
          headers: {
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': 'rating,userRatingCount,reviews',
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Google API error: ${response.status}`);
      }

      const data = await response.json();

      // Format reviews
      const reviews = (data.reviews || []).map(r => ({
        author: r.authorAttribution?.displayName || 'Anonymous',
        profilePhoto: r.authorAttribution?.photoUri || '',
        rating: r.rating || 5,
        text: r.text?.text || '',
        time: r.relativePublishTimeDescription || '',
        publishTime: r.publishTime || '',
      }));

      const result = {
        rating: data.rating || 4.7,
        totalReviews: data.userRatingCount || 170,
        reviews,
        fetchedAt: Date.now(),
      };

      // Cache in KV
      await env.IE_CACHE.put(CACHE_KEY, JSON.stringify(result), {
        expirationTtl: CACHE_TTL * 2, // Keep in KV for 48h as fallback
      });

      return new Response(JSON.stringify(result), { headers: corsHeaders });

    } catch (error) {
      // If API fails, try to return stale cache
      const stale = await env.IE_CACHE.get(CACHE_KEY, { type: 'json' });
      if (stale) {
        stale.stale = true;
        return new Response(JSON.stringify(stale), { headers: corsHeaders });
      }

      // Last resort: return error
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: corsHeaders }
      );
    }
  },
};
