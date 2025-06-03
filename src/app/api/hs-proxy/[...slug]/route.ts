import { NextRequest, NextResponse } from 'next/server';

const HYPERSWITCH_API_BASE_URL = 'https://sandbox.hyperswitch.io';
const JUSPAY_API_BASE_URL = 'https://sandbox.juspay.in';

// Define a custom RequestInit type that includes 'duplex'
interface RequestInitWithDuplex extends RequestInit {
  duplex?: 'half';
}

async function handler(req: NextRequest, { params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const path = slug.join('/');
  
  // Determine which API to proxy to
  let targetUrl: string;
  let headers = new Headers();
  
  if (path.includes('decide-gateway')) {
    // Route to Juspay for decide-gateway calls
    targetUrl = `${JUSPAY_API_BASE_URL}/${path}`;
    headers.set('Content-Type', 'application/json');
    headers.set('x-merchantid', 'hyperswitchTest');
  } else {
    // Existing Hyperswitch routing
    targetUrl = `${HYPERSWITCH_API_BASE_URL}/${path}`;
    
    // Copy existing header logic
    const apiKey = req.headers.get('api-key');
    const contentType = req.headers.get('Content-Type');
    const accept = req.headers.get('Accept');
    const xProfileId = req.headers.get('x-profile-id');
    const xFeature = req.headers.get('x-feature');
    
    if (apiKey) headers.set('api-key', apiKey);
    if (contentType) headers.set('Content-Type', contentType);
    if (accept) headers.set('Accept', accept);
    if (xProfileId) headers.set('x-profile-id', xProfileId);
    if (xFeature) headers.set('x-feature', xFeature);
  }

  try {
    const request_body = await req.text(); // Read the request body as text
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: headers,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? request_body : undefined,
      duplex: 'half' // Added for streaming request bodies in Node.js fetch
    } as RequestInitWithDuplex); // Cast to our custom type

   

    // Create a new NextResponse to stream the response back
    // This copies status, statusText, and headers from the origin response.
    // Clone the response to read its body and still stream it
    const clonedResponse = response.clone();
    const responseBody = await clonedResponse.json().catch(() => null); // Gracefully handle non-JSON or empty bodies

     if (targetUrl.includes("dynamic-routing")) {
      console.log(`[HS_PROXY] Dynamic routing request to ${targetUrl}`);
      // print the request body for debugging
      console.log(request_body);
      console.log(responseBody);
    }


    const newHeaders = new Headers(response.headers); // Copy original headers

    // Check if this is a payment response and extract data
    if (path.startsWith('payments') && response.ok && responseBody) {
      const paymentStatus = responseBody.status;
      // Attempt to find connector name, trying common fields
      const connectorName = responseBody.connector || responseBody.connector_name || responseBody.routing?.chosen_connector_id || responseBody.routing?.connector || 'unknown';
      
      if (paymentStatus) {
        newHeaders.set('x-simulation-payment-status', String(paymentStatus));
      }
      if (connectorName) {
        newHeaders.set('x-simulation-payment-connector', String(connectorName));
      }
    }

    // Create a new NextResponse to stream the response back
    // This copies status, statusText from the origin response, and uses our newHeaders.
    const nextResponse = new NextResponse(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders, // Use the potentially modified headers
    });

    return nextResponse;

  } catch (error) {
    console.error(`[HS_PROXY_ERROR] Failed to proxy request to ${targetUrl}:`, error);
    return NextResponse.json(
      { message: 'Error proxying request to Hyperswitch API', error: (error as Error).message },
      { status: 500 }
    );
  }
}

export { handler as GET, handler as POST, handler as PATCH, handler as PUT, handler as DELETE };
