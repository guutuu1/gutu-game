const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

/*
==================================================
SUPABASE
==================================================
*/

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  "https://mkmrmpkeigrwbnbsfzqm.supabase.co";

const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  "sb_publishable_29l1O6k0suVDtgrwTDpEYw_SBeY4nIN";

/*
==================================================
CHAPA
==================================================
*/

const CHAPA_SECRET_KEY =
  process.env.CHAPA_SECRET_KEY;

/*
==================================================
WEBSITE
==================================================
*/

app.use(
  express.static(
    path.join(__dirname, "..")
  )
);

app.get("/", (req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      "..",
      "index.html"
    )
  );
});

/*
==================================================
HELPER: READ CHAPA ERROR
==================================================
*/

function getChapaMessage(data) {

  if (!data) {
    return "Chapa returned an empty response.";
  }

  if (typeof data.message === "string") {
    return data.message;
  }

  if (
    data.message &&
    typeof data.message === "object"
  ) {
    try {
      return JSON.stringify(data.message);
    } catch (error) {
      return "Chapa returned an unreadable error message.";
    }
  }

  if (typeof data.error === "string") {
    return data.error;
  }

  if (
    data.error &&
    typeof data.error === "object"
  ) {
    try {
      return JSON.stringify(data.error);
    } catch (error) {
      return "Chapa returned an unreadable error.";
    }
  }

  if (typeof data.status === "string") {
    return `Chapa returned status: ${data.status}`;
  }

  try {
    return JSON.stringify(data);
  } catch (error) {
    return "Unknown Chapa error.";
  }
}

/*
==================================================
CHECK LOGIN SESSION
==================================================
*/

async function getAuthenticatedUser(req) {

  const authorization =
    req.headers.authorization || "";

  if (!authorization.startsWith("Bearer ")) {

    return {
      user: null,
      error: "Please log in first."
    };

  }

  const accessToken =
    authorization.substring(7);

  try {

    const response =
      await fetch(
        `${SUPABASE_URL}/auth/v1/user`,
        {
          method: "GET",

          headers: {
            "apikey":
              SUPABASE_ANON_KEY,

            "Authorization":
              `Bearer ${accessToken}`
          }
        }
      );

    const data =
      await response.json();

    if (!response.ok || !data.id) {

      console.error(
        "SUPABASE USER ERROR:",
        data
      );

      return {
        user: null,
        error:
          "Your login session is invalid or expired."
      };

    }

    return {
      user: data,
      error: null
    };

  } catch (error) {

    console.error(
      "Supabase authentication error:",
      error
    );

    return {
      user: null,
      error:
        "Could not verify your login."
    };

  }

}

/*
==================================================
CHAPA DEPOSIT
==================================================
*/

app.post(
  "/api/chapa/initialize",
  async (req, res) => {

    try {

      if (!CHAPA_SECRET_KEY) {

        console.error(
          "CHAPA_SECRET_KEY is missing."
        );

        return res.status(500).json({

          success: false,

          message:
            "CHAPA_SECRET_KEY is missing on Render."

        });

      }

      const {
        user,
        error: authError
      } =
        await getAuthenticatedUser(req);

      if (!user) {

        return res.status(401).json({

          success: false,

          message:
            authError ||
            "Please log in first."

        });

      }

      const amount =
        Number(req.body.amount);

      if (
        !Number.isFinite(amount) ||
        amount <= 0
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Please enter a valid deposit amount."

        });

      }

      const email =
        String(
          user.email || ""
        ).trim();

      if (!email) {

        return res.status(400).json({

          success: false,

          message:
            "Your account does not have an email address."

        });

      }

      const firstName =
        String(
          user.user_metadata?.first_name ||
          user.user_metadata?.firstName ||
          "Gutu"
        ).trim();

      const lastName =
        String(
          user.user_metadata?.last_name ||
          user.user_metadata?.lastName ||
          "Game"
        ).trim();

      const txRef =
        "GUTU-DEPOSIT-" +
        Date.now() +
        "-" +
        Math.floor(
          Math.random() * 1000000
        );

      const siteUrl =
        "https://gutu-game.onrender.com";

      const paymentData = {

        amount:
          amount.toFixed(2),

        currency:
          "ETB",

        email:
          email,

        first_name:
          firstName,

        last_name:
          lastName,

        tx_ref:
          txRef,

        callback_url:
          `${siteUrl}/api/chapa/callback`,

        return_url:
          `${siteUrl}/chicken.html?payment=returned`,

        customization: {

          title:
            "Gutu Game",

          description:
            "Gutu Game wallet deposit"

        }

      };

      console.log(
        "===================================="
      );

      console.log(
        "CHAPA DEPOSIT REQUEST:"
      );

      console.log(
        paymentData
      );

      const chapaResponse =
        await fetch(
          "https://api.chapa.co/v1/transaction/initialize",
          {

            method: "POST",

            headers: {

              "Authorization":
                `Bearer ${CHAPA_SECRET_KEY}`,

              "Content-Type":
                "application/json",

              "Accept":
                "application/json"

            },

            body:
              JSON.stringify(
                paymentData
              )

          }
        );

      const responseText =
        await chapaResponse.text();

      let chapaData = {};

      try {

        chapaData =
          responseText
            ? JSON.parse(responseText)
            : {};

      } catch (parseError) {

        console.error(
          "CHAPA RETURNED NON-JSON:",
          responseText
        );

        return res.status(502).json({

          success: false,

          message:
            "Chapa returned an invalid response.",

          details:
            responseText

        });

      }

      console.log(
        "CHAPA INITIALIZE STATUS:",
        chapaResponse.status
      );

      console.log(
        "CHAPA INITIALIZE RESPONSE:",
        chapaData
      );

      if (
        !chapaResponse.ok ||
        chapaData.status !== "success"
      ) {

        const readableMessage =
          getChapaMessage(
            chapaData
          );

        console.error(
          "CHAPA INITIALIZE FAILED:",
          readableMessage
        );

        return res.status(
          chapaResponse.status >= 400
            ? chapaResponse.status
            : 400
        ).json({

          success: false,

          message:
            readableMessage,

          status:
            chapaData.status ||
            "failed",

          chapa:
            chapaData

        });

      }

      const checkoutUrl =
        chapaData.data?.checkout_url;

      if (!checkoutUrl) {

        console.error(
          "CHAPA DID NOT RETURN CHECKOUT URL:",
          chapaData
        );

        return res.status(500).json({

          success: false,

          message:
            "Chapa did not return a checkout URL.",

          chapa:
            chapaData

        });

      }

      console.log(
        "CHAPA CHECKOUT URL CREATED:"
      );

      console.log(
        checkoutUrl
      );

      return res.status(200).json({

        success: true,

        message:
          "Payment initialized successfully.",

        tx_ref:
          txRef,

        checkout_url:
          checkoutUrl

      });

    } catch (error) {

      console.error(
        "CHAPA DEPOSIT ERROR:",
        error
      );

      return res.status(500).json({

        success: false,

        message:
          error.message ||
          "Chapa deposit server error."

      });

    }

  }
);

/*
==================================================
GET CHAPA BANK LIST
==================================================
*/

async function getChapaBanks() {

  if (!CHAPA_SECRET_KEY) {

    throw new Error(
      "CHAPA_SECRET_KEY is missing on Render."
    );

  }

  const response =
    await fetch(
      "https://api.chapa.co/v1/banks",
      {
        method: "GET",

        headers: {
          "Authorization":
            `Bearer ${CHAPA_SECRET_KEY}`,

          "Accept":
            "application/json"
        }
      }
    );

  const responseText =
    await response.text();

  let data = {};

  try {

    data =
      responseText
        ? JSON.parse(responseText)
        : {};

  } catch (error) {

    throw new Error(
      "Chapa returned an invalid bank-list response."
    );

  }

  console.log(
    "Chapa bank-list response status:",
    response.status
  );

  if (!response.ok) {

    console.error(
      "Chapa bank-list error:",
      data
    );

    throw new Error(
      getChapaMessage(data)
    );

  }

  return data;
}

/*
==================================================
FIND TELEBIRR BANK
==================================================
*/

async function findTelebirrBank() {

  const data =
    await getChapaBanks();

  let banks = [];

  if (Array.isArray(data.data)) {

    banks = data.data;

  } else if (
    data.data &&
    Array.isArray(data.data.data)
  ) {

    banks = data.data.data;

  } else if (
    data.data &&
    Array.isArray(data.data.banks)
  ) {

    banks = data.data.banks;

  }

  const telebirr =
    banks.find((bank) => {

      const name =
        String(
          bank.name ||
          bank.bank_name ||
          bank.bankName ||
          bank.bank ||
          ""
        ).toLowerCase();

      return name.includes(
        "telebirr"
      );

    });

  if (!telebirr) {

    console.error(
      "Telebirr was not found.",
      data
    );

    throw new Error(
      "Telebirr was not found in Chapa's bank list."
    );

  }

  const bankCode =
    telebirr.bank_code ??
    telebirr.code ??
    telebirr.id;

  if (
    bankCode === undefined ||
    bankCode === null ||
    bankCode === ""
  ) {

    throw new Error(
      "Chapa returned Telebirr without a bank code."
    );

  }

  console.log(
    "Telebirr bank found:",
    telebirr
  );

  return String(
    bankCode
  );
}

/*
==================================================
CHAPA PAYMENT CALLBACK
==================================================
*/

app.get(
  "/api/chapa/callback",
  async (req, res) => {

    try {

      if (!CHAPA_SECRET_KEY) {

        return res.status(500).send(
          "CHAPA_SECRET_KEY is not configured on Render."
        );

      }

      const txRef =
        req.query.trx_ref ||
        req.query.tx_ref ||
        "";

      const callbackStatus =
        req.query.status ||
        "";

      console.log(
        "CHAPA CALLBACK:",
        {
          txRef,
          callbackStatus
        }
      );

      if (!txRef) {

        return res.status(400).send(
          "Missing Chapa transaction reference."
        );

      }

      const verifyResponse =
        await fetch(
          `https://api.chapa.co/v1/transaction/verify/${encodeURIComponent(txRef)}`,
          {
            method: "GET",

            headers: {
              "Authorization":
                `Bearer ${CHAPA_SECRET_KEY}`,

              "Accept":
                "application/json"
            }
          }
        );

      const responseText =
        await verifyResponse.text();

      let verifyData = {};

      try {

        verifyData =
          responseText
            ? JSON.parse(responseText)
            : {};

      } catch (error) {

        console.error(
          "CHAPA VERIFY NON-JSON:",
          responseText
        );

        return res.status(502).send(
          "Chapa returned an invalid verification response."
        );

      }

      console.log(
        "CHAPA VERIFY STATUS:",
        verifyResponse.status
      );

      console.log(
        "CHAPA VERIFY RESPONSE:",
        verifyData
      );

      if (!verifyResponse.ok) {

        return res.status(400).send(
          getChapaMessage(
            verifyData
          )
        );

      }

      const transaction =
        verifyData.data ||
        {};

      const verifiedStatus =
        String(
          transaction.status ||
          verifyData.status ||
          ""
        ).toLowerCase();

      if (
        verifiedStatus === "success"
      ) {

        console.log(
          "CHAPA PAYMENT VERIFIED SUCCESSFULLY:",
          txRef
        );

        return res.redirect(
          "/chicken.html?payment=success"
        );

      }

      console.log(
        "CHAPA PAYMENT NOT SUCCESSFUL:",
        {
          txRef,
          verifiedStatus
        }
      );

      return res.redirect(
        "/chicken.html?payment=failed"
      );

    } catch (error) {

      console.error(
        "CHAPA CALLBACK ERROR:",
        error
      );

      return res.status(500).send(
        error.message ||
        "Chapa callback server error."
      );

    }

  }
);

/*
==================================================
AUTOMATIC WITHDRAWAL
==================================================
*/

app.post(
  "/api/withdraw",
  async (req, res) => {

    try {

      if (!CHAPA_SECRET_KEY) {

        return res.status(500).json({

          success: false,

          message:
            "CHAPA_SECRET_KEY is not configured on Render."

        });

      }

      const {
        user,
        error: authError
      } =
        await getAuthenticatedUser(req);

      if (!user) {

        return res.status(401).json({

          success: false,

          message:
            authError ||
            "Authentication failed."

        });

      }

      const {
        amount,
        accountNumber,
        method
      } = req.body;

      const withdrawalAmount =
        Number(amount);

      const account =
        String(
          accountNumber || ""
        ).trim();

      if (
        !Number.isFinite(
          withdrawalAmount
        )
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Invalid withdrawal amount."

        });

      }

      if (
        withdrawalAmount < 50
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Minimum withdrawal is 50 ETB."

        });

      }

      if (
        !account ||
        account.length < 5
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Please enter a valid Telebirr account number."

        });

      }

      if (
        method !== "Telebirr"
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Automatic withdrawal is currently configured for Telebirr."

        });

      }

      const reference =
        "GUTU-" +
        Date.now() +
        "-" +
        Math.floor(
          Math.random() * 1000000
        );

      const bankCode =
        await findTelebirrBank();

      const chapaResponse =
        await fetch(
          "https://api.chapa.co/v1/transfers",
          {

            method: "POST",

            headers: {

              "Authorization":
                `Bearer ${CHAPA_SECRET_KEY}`,

              "Content-Type":
                "application/json",

              "Accept":
                "application/json"

            },

            body: JSON.stringify({

              account_number:
                account,

              amount:
                withdrawalAmount.toFixed(2),

              currency:
                "ETB",

              reference:
                reference,

              bank_code:
                bankCode

            })

          }
        );

      const responseText =
        await chapaResponse.text();

      let chapaData = {};

      try {

        chapaData =
          responseText
            ? JSON.parse(responseText)
            : {};

      } catch (error) {

        return res.status(502).json({

          success: false,

          message:
            "Chapa returned an invalid transfer response.",

          details:
            responseText

        });

      }

      console.log(
        "Chapa transfer status:",
        chapaResponse.status
      );

      console.log(
        "Chapa transfer response:",
        chapaData
      );

      if (!chapaResponse.ok) {

        return res.status(
          chapaResponse.status
        ).json({

          success: false,

          message:
            getChapaMessage(
              chapaData
            ),

          reference:
            reference,

          chapa:
            chapaData

        });

      }

      return res.status(200).json({

        success: true,

        status:
          chapaData.status ||
          "pending",

        message:
          getChapaMessage(
            chapaData
          ),

        reference:
          reference,

        chapa:
          chapaData

      });

    } catch (error) {

      console.error(
        "WITHDRAWAL ERROR:",
        error
      );

      return res.status(500).json({

        success: false,

        message:
          error.message ||
          "Withdrawal server error."

      });

    }

  }
);

/*
==================================================
START SERVER
==================================================
*/

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `Gutu-Game running on port ${PORT}`
    );

  }
);
