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
            `Bearer ${CHAPA_SECRET_KEY}`
        }
      }
    );


  const data =
    await response.json();


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
      data.message ||
      "Could not retrieve Chapa bank list."
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

      return (
        name.includes("telebirr")
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


  return String(bankCode);

}


/*
==================================================
CHAPA PAYMENT CALLBACK
==================================================

Chapa sends the transaction reference and status
to this URL after payment.

IMPORTANT:
We verify the transaction directly with Chapa
before treating it as successful.
==================================================
*/

app.get(
  "/api/chapa/callback",
  async (req, res) => {

    try {

      /*
      --------------------------------------------
      CHECK CHAPA KEY
      --------------------------------------------
      */

      if (!CHAPA_SECRET_KEY) {

        return res.status(500).send(
          "CHAPA_SECRET_KEY is not configured on Render."
        );

      }


      /*
      --------------------------------------------
      GET TRANSACTION REFERENCE
      --------------------------------------------
      */

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


      /*
      --------------------------------------------
      VERIFY TRANSACTION WITH CHAPA
      --------------------------------------------
      */

      const verifyResponse =
        await fetch(
          `https://api.chapa.co/v1/transaction/verify/${encodeURIComponent(txRef)}`,
          {
            method: "GET",

            headers: {
              "Authorization":
                `Bearer ${CHAPA_SECRET_KEY}`
            }
          }
        );


      const verifyData =
        await verifyResponse.json();


      console.log(
        "CHAPA VERIFY STATUS:",
        verifyResponse.status
      );


      console.log(
        "CHAPA VERIFY RESPONSE:",
        verifyData
      );


      /*
      --------------------------------------------
      VERIFY REQUEST FAILED
      --------------------------------------------
      */

      if (!verifyResponse.ok) {

        return res.status(400).send(
          "Chapa transaction verification failed."
        );

      }


      /*
      --------------------------------------------
      GET VERIFIED TRANSACTION
      --------------------------------------------
      */

      const transaction =
        verifyData.data ||
        {};


      const verifiedStatus =
        String(
          transaction.status ||
          verifyData.status ||
          ""
        ).toLowerCase();


      /*
      --------------------------------------------
      PAYMENT SUCCESS
      --------------------------------------------
      */

      if (
        verifiedStatus === "success"
      ) {

        console.log(
          "CHAPA PAYMENT VERIFIED SUCCESSFULLY:",
          txRef
        );


        /*
        IMPORTANT:
        Wallet crediting will be connected to the
        user's deposit record in the next step.
        We do NOT automatically add money here yet.
        */


        return res.redirect(
          "/chicken.html?payment=success"
        );

      }


      /*
      --------------------------------------------
      PAYMENT NOT SUCCESSFUL
      --------------------------------------------
      */

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

      /*
      --------------------------------------------
      CHAPA KEY
      --------------------------------------------
      */

      if (!CHAPA_SECRET_KEY) {

        return res.status(500).json({

          success: false,

          message:
            "CHAPA_SECRET_KEY is not configured on Render."

        });

      }


      /*
      --------------------------------------------
      AUTHENTICATE USER
      --------------------------------------------
      */

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


      /*
      --------------------------------------------
      GET WITHDRAWAL DATA
      --------------------------------------------
      */

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


      /*
      --------------------------------------------
      VALIDATE AMOUNT
      --------------------------------------------
      */

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


      /*
      --------------------------------------------
      VALIDATE ACCOUNT
      --------------------------------------------
      */

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


      /*
      --------------------------------------------
      VALIDATE METHOD
      --------------------------------------------
      */

      if (
        method !== "Telebirr"
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Automatic withdrawal is currently configured for Telebirr."

        });

      }


      /*
      --------------------------------------------
      UNIQUE REFERENCE
      --------------------------------------------
      */

      const reference =
        "GUTU-" +
        Date.now() +
        "-" +
        Math.floor(
          Math.random() * 1000000
        );


      /*
      --------------------------------------------
      FIND TELEBIRR BANK CODE
      --------------------------------------------
      */

      const bankCode =
        await findTelebirrBank();


      /*
      --------------------------------------------
      SEND TRANSFER TO CHAPA
      --------------------------------------------
      */

      const chapaResponse =
        await fetch(
          "https://api.chapa.co/v1/transfers",
          {

            method: "POST",

            headers: {

              "Authorization":
                `Bearer ${CHAPA_SECRET_KEY}`,

              "Content-Type":
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


      const chapaData =
        await chapaResponse.json();


      console.log(
        "Chapa transfer status:",
        chapaResponse.status
      );


      console.log(
        "Chapa transfer response:",
        chapaData
      );


      /*
      --------------------------------------------
      CHAPA REJECTED REQUEST
      --------------------------------------------
      */

      if (!chapaResponse.ok) {

        return res.status(
          chapaResponse.status
        ).json({

          success: false,

          message:
            chapaData.message ||
            "Chapa rejected the transfer.",

          reference:
            reference

        });

      }


      /*
      --------------------------------------------
      CHAPA ACCEPTED / QUEUED
      --------------------------------------------
      */

      return res.status(200).json({

        success: true,

        status:
          chapaData.status ||
          "pending",

        message:
          chapaData.message ||
          "Transfer request accepted by Chapa.",

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
  () => {

    console.log(
      `Gutu-Game running on port ${PORT}`
    );

  }
);
