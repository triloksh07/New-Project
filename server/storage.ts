import session from "express-session";
import { users, type User, type InsertUser } from "@shared/schema";
import { eq } from "drizzle-orm";
import { db, pool } from "./db";
import connectPg from "connect-pg-simple";

const PostgresSessionStore = connectPg(session);

export interface IStorage {
  // User management
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByResetToken(token: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  setResetToken(userId: number, token: string, expiry: string): Promise<void>;
  updatePassword(userId: number, hashedPassword: string): Promise<void>;
  // Session store
  sessionStore: session.Store;
}

export class DatabaseStorage implements IStorage {
  sessionStore: session.Store;

  constructor() {
    this.sessionStore = new PostgresSessionStore({ 
      pool,
      createTableIfMissing: true
    });
  }

  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUserByResetToken(token: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.resetToken, token));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users)
      .values({
        ...insertUser,
        createdAt: new Date().toISOString(),
        isGoogleUser: false
      })
      .returning();
    return user;
  }

  async setResetToken(userId: number, token: string, expiry: string): Promise<void> {
    await db.update(users)
      .set({ resetToken: token, resetTokenExpiry: expiry })
      .where(eq(users.id, userId));
  }

  async updatePassword(userId: number, hashedPassword: string): Promise<void> {
    await db.update(users)
      .set({ 
        password: hashedPassword, 
        resetToken: null, 
        resetTokenExpiry: null 
      })
      .where(eq(users.id, userId));
  }
}

export const storage = new DatabaseStorage();