# client-session

Client-side session storage and management for Express in Node.js.

## About

Client-session is Express middleware that issues and validates JWTs stored in a httpOnly cookie, and ties data to Express' `req` object. It behaves in a similar manner to Express-session, only without a store (since data is stored in the cookie/JWT). This eliminates the need to refer to a database for session-related data.

## A note about security

Because client-session uses **stateless tokens** for session storage, this does mean that it's impossible to dynamically invalidate tokens once they are issued without tracking them on the server side (in which case, traditional sessions are probably more practical). This isn't a problem in some applications not working with sensative/private data, however, you should use centralized sessions if you require the ability to terminate a session on-demand. Client-session shines in smaller applications where users need temporary state tracking and strict control of the session's persistence isn't needed. You are also limited in the amount of data you can store in cookies, which is where the JWT is stored (max 4kb). One area you are protected, however, is from outside-network token usage. Any use of a token outside the network from which the token was issued will send a `HTTP 403` status code.

**TLDR; If you need the following features, use *standard server-side sessions* instead:**

1. The ability to invalidate tokens on the server side (the best you can do is delete the cookie in this middleware using the `clientSession.terminate()` method or wait for it [and the token] to expire).

2. The ability to store more than 4kb worth of data in a session (session data is stored in cookies using this middleware).

## Setup

1. Run `npm install`.

2. Be sure `cookie-parser` middleware for Express installed and used on any routes that will be using the session.

3. Create a `new ClientSession({})` instance from the ClientSession and configure as desired. We will name the instance `clientSession` in this documentation. The configuration object has two properties: `secret` and `expiresIn`.
   
   1. `secret` is what's used to sign and validate the JWT. You can place whatever you want here. Keep it in a safe place!
   
   2. `expiresIn` is the number of seconds you wish the session to be alive for. A new token with this duration is issued and sent with each response.

4. Use`clientSession.middleware.bind(clientSession)` on any routes you wish to use client-session. We use the `bind()` method on itself to preserve `this` when used inside of the `app.use()` method.
   
   1. IMPORTANT: use client session after `cookie-parser` so the client-session has access to to the `req.cookies` object.

5. Profit! Now, your routes will have access to the `req.clientSession` object.

### Setup example:

```javascript
import express from 'express';
const app = express();

// Use cookie-parser
import cookieParser from 'cookie-parser';
app.use(cookieParser());

// Use client-session
import ClientSession from 'client-session';
const clientSession = new ClientSession({
    secret: 'Shhhhhh',
    expiresIn: 7 * 24 * 60 * 60, // Expires in 7 days.
});
// Bind clientSession object to itself to preserve 'this'
app.use(clientSession.middleware.bind(clientSession));
```

## Usage

On any routes you have "used" client-session on, the `clientSession` object will be available on Express' `req` object. For example, if we wanted to track a user's name, we could add the following to our route logic:

```javascript
app.get('/', (req, res) => {
    req.clientSession.name = 'John'; 
});
```

Now the value of `req.clientSession.name` will persist for any future requests made by the client.

You can clear/delete the session any time using the `clientSession.terminate()` method.

```javascript
req.clientSession.terminate();
```

The session token will be removed on the next response sent to the client.

## Full Example:

In this example, we have a simple counter. On every refresh to the root route, the session is read from the client cookie, updated, and re-sent when Express' `res.send()` method is called. When the stored value reaches 5, the session is then cleared using the `res.clientSession.terminate()` method.

```javascript
import express from 'express';
const app = express();

// Use cookie-parser
import cookieParser from 'cookie-parser';
app.use(cookieParser());

// Use client-session
import ClientSession from 'client-session';
const clientSession = new ClientSession({
    secret: 'Shhhhhh',
    expiresIn: 7 * 24 * 60 * 60, // Expires in 7 days.
});
// Bind clientSession object to itself to preserve 'this'
app.use(clientSession.middleware.bind(clientSession));

// Begin route logic
app.get('/', (req, res) => {
    // req.clientSession object is now exposed
    if (req.clientSession.counter === undefined) {
        req.clientSession.counter = 0;
        return res.send(JSON.stringify(req.clientSession.counter));
    }

    req.clientSession.counter++;
    console.log(req.clientSession);

    if (req.clientSession.counter >= 5) {
        req.clientSession.terminate();
        console.log(req.clientSession);
        return res.send(JSON.stringify('Session has been cleared.'));
    }

    return res.send(JSON.stringify(req.clientSession.counter));
});

// Listen!
const port = 80;
app.listen(port, () => {
   console.log(`Listening on port ${port}.`); 
});
```

To see how it's working in your browser, simply visit the root route and look at your cookies. You can then go a step further and decode your JWT using something like [JSToolSet](https://www.jstoolset.com/jwt) to view the session state sent to your client.

Enjoy!
