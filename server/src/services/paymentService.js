import crypto from "crypto";
import { getPool } from "../config/db.js";

/**
 * Interface for Payment Gateways.
 * Can be swapped for Stripe, PayPal, Razorpay, etc.
 */
export class PaymentGatewayInterface {
  async createCheckoutSession(params) {
    throw new Error("createCheckoutSession must be implemented by payment gateway provider.");
  }
  async verifyTransactionServerSide(transactionReference) {
    throw new Error("verifyTransactionServerSide must be implemented by payment gateway provider.");
  }
}

/**
 * Robust mock implementation with server-side validation and verification.
 * Does not trust client-supplied payment success flags.
 */
export class MockPaymentGateway extends PaymentGatewayInterface {
  async createCheckoutSession({ applicationId, amount, currency, clientBaseUrl }) {
    const txRef = `TX-${Date.now()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
    const token = crypto.randomBytes(16).toString("hex");

    const pool = getPool();
    await pool.query(
      `INSERT INTO payment_transactions (application_id, transaction_reference, amount, currency, gateway, gateway_transaction_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [applicationId, txRef, amount, currency, "MockGateway", token, "Pending"]
    );

    // Provide a callback endpoint that simulates gateway return
    const defaultBaseUrl = process.env.NODE_ENV === "production" ? "https://college-project-backend-1.onrender.com" : "http://localhost:3000";
    const checkoutUrl = `${(clientBaseUrl || process.env.CLIENT_URL || defaultBaseUrl).replace(/\/$/, "")}/api/student/payments/verify-gateway?ref=${txRef}&token=${token}`;

    return {
      transactionReference: txRef,
      checkoutUrl,
    };
  }

  async verifyTransactionServerSide(transactionReference, token) {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT * FROM payment_transactions WHERE transaction_reference = ? LIMIT 1`,
      [transactionReference]
    );

    if (!rows.length) {
      throw new Error("Transaction record not found.");
    }

    const tx = rows[0];
    if (tx.status === "Paid") {
      return { success: true, alreadyPaid: true, tx };
    }

    if (tx.gateway_transaction_id !== token) {
      throw new Error("Payment signature verification failed. Untrusted gateway token.");
    }

    // Mark as paid on the server
    await pool.query(
      `UPDATE payment_transactions SET status = 'Paid', paid_at = NOW() WHERE id = ?`,
      [tx.id]
    );

    // Record timeline entry in application history
    await pool.query(
      `INSERT INTO application_status_history (application_id, step, status, remarks)
       VALUES (?, ?, ?, ?)`,
      [tx.application_id, "Application Fee Paid", "Paid", `Payment received via MockGateway ref: ${transactionReference}`]
    );

    return { success: true, tx };
  }
}

export const activePaymentGateway = new MockPaymentGateway();
