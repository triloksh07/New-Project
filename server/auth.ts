import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser, insertUserSchema, resetPasswordSchema, updatePasswordSchema } from "@shared/schema";
import { fromZodError } from "zod-validation-error";
import { sendPasswordResetEmail } from "./email";

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

export function setupAuth(app: Express) {
  const sessionSettings: session.SessionOptions = {
    secret: process.env.REPL_ID!,
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
  };

  if (app.get("env") === "production") {
    app.set("trust proxy", 1);
  }

  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  // Local Strategy - Use email field instead of username
  passport.use(
    new LocalStrategy(
      { usernameField: "email" },
      async (email, password, done) => {
        try {
          const user = await storage.getUserByEmail(email);
          if (!user || !(await comparePasswords(password, user.password))) {
            return done(null, false, { message: "Invalid email or password" });
          }
          return done(null, user);
        } catch (error) {
          return done(error);
        }
      },
    ),
  );

  const protocol = app.get("env") === "production" ? "https" : "http";
  const host = process.env.REPL_SLUG && process.env.REPL_OWNER
    ? `${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`
    : "localhost:5000";
  const callbackURL = `${protocol}://${host}/api/auth/google/callback`;

  // Password reset request
  app.post("/api/forgot-password", async (req, res) => {
    try {
      const { email } = resetPasswordSchema.parse(req.body);
      const user = await storage.getUserByEmail(email);

      if (!user) {
        // Don't reveal whether the email exists
        return res.status(200).json({
          message: "If an account exists with that email, a password reset link will be sent."
        });
      }

      // Generate reset token
      const token = randomBytes(32).toString("hex");
      const expiry = new Date();
      expiry.setHours(expiry.getHours() + 1); // Token valid for 1 hour

      // Save token and expiry
      await storage.setResetToken(user.id, token, expiry.toISOString());

      // Build the reset link
      const protocol = app.get("env") === "production" ? "https" : "http";
      const host = process.env.REPL_SLUG && process.env.REPL_OWNER
        ? `${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`
        : "localhost:5000";
      const resetLink = `${protocol}://${host}/auth/reset-password?token=${token}`;

      // Send the email
      const emailSent = await sendPasswordResetEmail(email, resetLink);

      if (!emailSent) {
        console.error('Failed to send password reset email');
      }

      res.status(200).json({
        message: "If an account exists with that email, a password reset link will be sent.",
        // Remove this in production:
        debug: {
          resetLink
        }
      });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });

  // Reset password with token
  app.post("/api/reset-password", async (req, res) => {
    try {
      const { token, password } = updatePasswordSchema.parse(req.body);

      // Find user by reset token
      const user = await storage.getUserByResetToken(token);

      if (!user) {
        return res.status(400).json({ message: "Invalid or expired reset token" });
      }

      // Check if token is expired
      const expiry = new Date(user.resetTokenExpiry!);
      if (expiry < new Date()) {
        return res.status(400).json({ message: "Reset token has expired" });
      }

      // Update password and clear reset token
      const hashedPassword = await hashPassword(password);
      await storage.updatePassword(user.id, hashedPassword);

      res.status(200).json({ message: "Password updated successfully" });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });


  // Google OAuth Strategy
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          callbackURL,
        },
        async function verify(accessToken, refreshToken, profile, done) {
          try {
            const email = profile.emails?.[0]?.value;
            if (!email) {
              return done(new Error("No email provided from Google"));
            }

            // Check if user exists by their email
            let user = await storage.getUserByEmail(email);

            if (!user) {
              // Create new user if they don't exist
              user = await storage.createUser({
                email,
                password: await hashPassword(randomBytes(32).toString("hex")),
              });
            }

            return done(null, user);
          } catch (err) {
            return done(err as Error);
          }
        },
      ),
    );
  }

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user);
    } catch (error) {
      done(error);
    }
  });

  // Local auth routes with proper validation
  app.post("/api/register", async (req, res, next) => {
    try {
      // Validate request body
      const validatedData = insertUserSchema.parse(req.body);

      const existingUser = await storage.getUserByEmail(validatedData.email);
      if (existingUser) {
        return res.status(400).json({ message: "Email already registered" });
      }

      const user = await storage.createUser({
        ...validatedData,
        password: await hashPassword(validatedData.password),
      });

      req.login(user, (err) => {
        if (err) return next(err);
        res.status(201).json(user);
      });
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ message: error.message });
      } else {
        next(error);
      }
    }
  });

  app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err: Error, user: Express.User | false, info: { message: string } | undefined) => {
      if (err) return next(err);
      if (!user) {
        return res.status(401).json({ message: info?.message || "Invalid credentials" });
      }
      req.login(user, (err) => {
        if (err) return next(err);
        res.status(200).json(user);
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    res.json(req.user);
  });

  // Google OAuth routes with better error handling
  app.get(
    "/api/auth/google",
    (req, res, next) => {
      passport.authenticate("google", {
        scope: ["profile", "email"],
        prompt: "select_account",
      })(req, res, next);
    }
  );

  app.get(
    "/api/auth/google/callback",
    passport.authenticate("google", {
      failureRedirect: "/auth?error=google-auth-failed",
      successRedirect: "/",
    })
  );
}