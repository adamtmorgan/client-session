// Written by Adam Morgan
// Copyright Bitfluent, LLC 2022

// External dependencies
import jwt from 'jsonwebtoken';

// Internal dependencies
import DeepProxy from './DeepProxy.js';

/**
 * Returns a new SessionObj meant to be set to req.clientSession.
 * @param {object} prevPayload payload from previous clientSession token.
 * @param {string} ip ip address from request origin.
 * @param {function} issueToken callback for issuing a new token and setting to a cookie.
 * @param {function} terminateCallback callback for terminating the session.
 * @returns new DeepProxy that calls the issueToken callback on property set and delete.
 */
export class SessionObj {
	// Fields
	#data;
	#issueToken;

	constructor(prevPayload, ip, issueToken, terminateCallback) {
		const self = this;

		// Passes token payload to token issuer in ClientSession
		this.#issueToken = (payload) => {
			issueToken(payload);
		};

		if (prevPayload !== undefined) {
			this.#data = prevPayload;
			this.#data.terminate = () => {
				terminateCallback();
			};
		} else {
			this.#data = {};
			this.#data.originIP = ip;
			this.#data.terminate = () => {
				terminateCallback();
			};
		}

		/**
		 * For determining if a property is reserved in SessionObj
		 * @param {string} rootProp 
		 * @returns true if property is reserved. false if it's not.
		 */
		function reservedProp(rootProp) {
			const reservedProps = ['originIP', 'terminate'];
			for (let prop of reservedProps) {
				if (rootProp === prop) {
					return true;
				}
			}
			return false;
		}

		// Tracks object tree.
		// Generates new JWT and applies it to response cookie on property set.
		return new DeepProxy(this.#data, {
			set(_target, key, _value, _receiver) {
				if (reservedProp(key[0])) {
					throw new Error(`client-session: ${key[0]} is a reserved property and cannot be set.`)
				}
				self.#issueToken(JSON.stringify(self.#data));
			},

			deleteProperty(_target, key) {
				console.log(key[0]);
				if (reservedProp(key[0])) {
					throw new Error(`client-sesion: ${key[0]} is a reserved property and cannot be deleted.`)
				}
				self.#issueToken(JSON.stringify(self.#data));
			},
		});
	}
}

/**
 * Returns a new ClientSession for use in Express.
 * @param {object} options - {secret: String, expiresIn: Number (seconds), restrictIPAccess: Boolean}
 * @returns new ClientSession as configured with options.
 * @example
 * const clientSession = new ClientSession({
 * 	secret: 'Shhh', // Used to sign tokens
 * 	expresIn: 24 * 60 * 60, // Life of token and cookie in seconds
 * 	restrictIPAccess: false // Deny access if token is used from a different IP than it was issued from
 * });
 *
 * app.use(clientSession.middleware.bind(clientSession));
 */
export default class ClientSession {
	constructor(options) {
		this.secret = options.secret;
		this.expiresIn = options.expiresIn;
		this.restrictIPAccess = options.restrictIPAccess;
	}

	updateCookie(token, _req, res) {
		const cookieOptions = {
			expires: new Date(Date.now() + this.expiresIn),
			httpOnly: true,
		};
		res.cookie('accessToken', token, cookieOptions);
	}

	/**
	 * Returns a new SessionObj that will be set to req.clientSession.
	 * @param {object} payload
	 * @param {object} req
	 * @param {object} res
	 * @returns new SessionObj containing previous payload or empty (if payload is undefined)
	 */
	createSessionObj(payload, req, res) {
		const jwtOptions = {
			algorithm: 'HS256',
		};

		return new SessionObj(
			payload,
			req.ip,
			(tokenPayload) => {
				const token = jwt.sign(
					{
						exp: Math.floor(Date.now() / 1000) + this.expiresIn,
						data: tokenPayload,
					},
					this.secret,
					jwtOptions
				);
				this.updateCookie(token, req, res);
			},
			() => {
				res.clearCookie('accessToken');
				req.clientSession = this.createSessionObj(undefined, req, res);
			}
		);
	}

	/**
	 * Method used as Express middleware. Bind instance to itself to preserve 'this'
	 * @param {object} req
	 * @param {object} res
	 * @param {function} next
	 * @example
	 * app.use(clientSession.middleware().bind(clientSession));
	 */
	middleware(req, res, next) {
		// Issues JWT if not already present.
		if (req.cookies.accessToken === undefined) {
			req.clientSession = req.clientSession = this.createSessionObj(
				undefined,
				req,
				res
			);
			return next();
		}

		// Verify token and apply it to the req object for use in routes.
		jwt.verify(req.cookies.accessToken, this.secret, (err, payload) => {
			if (err) {
				return res.sendStatus(403);
			}

			const tokenData = JSON.parse(payload.data);

			// Verifies stored IP is the same as request origin if restrictIPAccess enabled.
			if (tokenData.originIP !== req.ip && this.restrictIPAccess) {
				return res.sendStatus(403);
			}

			req.clientSession = this.createSessionObj(tokenData, req, res);
			next();
		});
	}
}
