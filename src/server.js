const express = require("express");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/*
==================================================
SUPABASE
==================================================
*/

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  "https://mkmrmpkeigrwbnbsfzqm.supabase.co";

const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY || "";

const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "";

/*
==================================================
CHAPA
==================================================
*/

const CHAPA_SECRET_KEY =
  process.env.CHAPA_SECRET_KEY || "";

const SITE_URL =
  process.env.SITE_URL ||
  "https://gutu-game.onrender.com";


/*
==================================================
SUPABASE REQUEST HELPER
==================================================
*/

async function supabaseRequest(endpoint, options = {}) {

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not configured."
    );
  }

  const response = await fetch(
    `${SUPABASE_URL}${endpoint}`,
    {
      ...options,

      headers: {
        "Content-Type": "application/json",

        apikey:
          SUPABASE_SERVICE_ROLE_KEY,

        Authorization:
          `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,

        ...(options.headers || {})
      }
    }
  );

  const text =
    await response.text();

  let data;

  try {

    data =
      text
        ? JSON.parse(text)
        : null;

  } catch {

    data = text;

  }

  if (!response.ok) {

    throw new Error(
      typeof data === "string"
        ? data
        : JSON.stringify(data)
    );

  }

  return data;

}


/*
==================================================
GET LOGGED-IN USER
==================================================
*/

async function getUserFromToken(req) {

  const authHeader =
    req.headers.authorization || "";

  if (
    !authHeader.startsWith(
      "Bearer "
    )
  ) {

    return null;

  }

  const token =
    authHeader.substring(7);

  if (!token) {

    return null;

  }

  const response =
    await fetch(
      `${SUPABASE_URL}/auth/v1/user`,
      {
        method: "GET",

        headers: {

          apikey:
            SUPABASE_ANON_KEY,

          Authorization:
            `Bearer ${token}`

        }
      }
    );

  if (!response.ok) {

    return null;

  }

  return await response.json();

}


/*
==================================================
HEALTH CHECK
==================================================
*/

app.get(
  "/health",
  (req, res) => {

    res.json({

      success: true,

      message:
        "Gutu Game server is running",

      port:
        PORT

    });

  }
);


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

        return res.status(500).json({

          success: false,

          message:
            "CHAPA_SECRET_KEY is not configured."

        });

      }

      const user =
        await getUserFromToken(req);

      if (!user) {

        return res.status(401).json({

          success: false,

          message:
            "Please login first."

        });

      }

      const amount =
        Number(req.body.amount);

      if (
        !amount ||
        amount <= 0
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Enter a valid deposit amount."

        });

      }

      /*
      Chapa tx_ref must not exceed 50 characters.
      */

      const txRef =
        `GUTU-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}`;

      const firstName =
        user.user_metadata?.first_name ||
        user.user_metadata?.name ||
        "Gutu";

      const lastName =
        user.user_metadata?.last_name ||
        "Game";

      const email =
        user.email;


      /*
      ----------------------------------------------
      SAVE PENDING TRANSACTION
      ----------------------------------------------
      */

      try {

        await supabaseRequest(
          "/rest/v1/transactions",
          {

            method: "POST",

            headers: {

              Prefer:
                "return=minimal"

            },

            body:
              JSON.stringify({

                user_id:
                  user.id,

                amount:
                  amount,

                type:
                  "deposit",

                status:
                  "pending",

                reference:
                  txRef

              })

          }
        );

      } catch (databaseError) {

        console.error(
          "Transaction save error:",
          databaseError.message
        );

        return res.status(500).json({

          success: false,

          message:
            "Could not save the transaction.",

          error:
            databaseError.message

        });

      }


      /*
      ----------------------------------------------
      CHAPA INITIALIZATION
      ----------------------------------------------
      */

      const chapaResponse =
        await fetch(
          "https://api.chapa.co/v1/transaction/initialize",
          {

            method: "POST",

            headers: {

              Authorization:
                `Bearer ${CHAPA_SECRET_KEY}`,

              "Content-Type":
                "application/json"

            },

            body:
              JSON.stringify({

                amount:
                  amount.toString(),

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
                  `${SITE_URL}/api/chapa/callback?tx_ref=${encodeURIComponent(txRef)}`,

                return_url:
                  `${SITE_URL}/chicken.html`,

                customization: {

                  title:
                    "Gutu Game",

                  description:
                    "Gutu Game Deposit"

                }

              })

          }
        );


      const chapaText =
        await chapaResponse.text();

      let chapaData;

      try {

        chapaData =
          JSON.parse(chapaText);

      } catch {

        chapaData = {

          raw:
            chapaText

        };

      }


      if (!chapaResponse.ok) {

        console.error(
          "Chapa error:",
          chapaData
        );

        return res.status(500).json({

          success: false,

          message:
            "Chapa could not initialize the payment.",

          details:
            chapaData

        });

      }


      const checkoutUrl =
        chapaData?.data?.checkout_url;


      if (!checkoutUrl) {

        return res.status(500).json({

          success: false,

          message:
            "Chapa did not return a checkout URL.",

          details:
            chapaData

        });

      }


      return res.json({

        success:
          true,

        message:
          "Payment initialized successfully.",

        checkout_url:
          checkoutUrl,

        tx_ref:
          txRef

      });


    } catch (error) {

      console.error(
        "CHAPA INITIALIZE ERROR:",
        error
      );

      return res.status(500).json({

        success:
          false,

        message:
          "Deposit initialization failed.",

        error:
          error.message

      });

    }

  }
);


/*
==================================================
CHAPA CALLBACK
==================================================
*/

app.get(
  "/api/chapa/callback",
  async (req, res) => {

    try {

      const txRef =
        req.query.tx_ref ||
        req.query.trx_ref;


      if (!txRef) {

        return res.status(400).send(
          "Missing transaction reference."
        );

      }


      if (!CHAPA_SECRET_KEY) {

        return res.status(500).send(
          "CHAPA_SECRET_KEY is not configured."
        );

      }


      const verifyResponse =
        await fetch(
          `https://api.chapa.co/v1/transaction/verify/${encodeURIComponent(txRef)}`,
          {

            method:
              "GET",

            headers: {

              Authorization:
                `Bearer ${CHAPA_SECRET_KEY}`

            }

          }
        );


      const verifyText =
        await verifyResponse.text();

      let verifyData;

      try {

        verifyData =
          JSON.parse(verifyText);

      } catch {

        verifyData = {

          raw:
            verifyText

        };

      }


      if (!verifyResponse.ok) {

        console.error(
          "Chapa verification failed:",
          verifyData
        );

        return res.status(400).send(
          "Payment verification failed."
        );

      }


      const status =
        verifyData?.data?.status;


      if (
        status === "success" ||
        status === "completed"
      ) {

        const transaction =
          await supabaseRequest(
            `/rest/v1/transactions?reference=eq.${encodeURIComponent(txRef)}&select=*`,
            {
              method:
                "GET"
            }
          );


        if (
          transaction &&
          transaction.length > 0
        ) {

          const tx =
            transaction[0];


          if (
            tx.status !==
            "completed"
          ) {

            await supabaseRequest(
              `/rest/v1/transactions?reference=eq.${encodeURIComponent(txRef)}`,
              {

                method:
                  "PATCH",

                headers: {

                  Prefer:
                    "return=minimal"

                },

                body:
                  JSON.stringify({

                    status:
                      "completed"

                  })

              }
            );


            const wallets =
              await supabaseRequest(
                `/rest/v1/wallets?user_id=eq.${encodeURIComponent(tx.user_id)}&select=*`,
                {
                  method:
                    "GET"
                }
              );


            if (
              wallets &&
              wallets.length > 0
            ) {

              const wallet =
                wallets[0];

              const currentBalance =
                Number(
                  wallet.balance || 0
                );

              const depositAmount =
                Number(
                  tx.amount || 0
                );

              const newBalance =
                currentBalance +
                depositAmount;


              await supabaseRequest(
                `/rest/v1/wallets?id=eq.${encodeURIComponent(wallet.id)}`,
                {

                  method:
                    "PATCH",

                  headers: {

                    Prefer:
                      "return=minimal"

                  },

                  body:
                    JSON.stringify({

                      balance:
                        newBalance,

                      updated_at:
                        new Date()
                          .toISOString()

                    })

                }
              );


              console.log(
                `Deposit credited: ${depositAmount} ETB to ${tx.user_id}`
              );

            } else {

              console.log(
                "Wallet not found for user:",
                tx.user_id
              );

            }

          }

        }

      }


      return res.redirect(
        `${SITE_URL}/chicken.html?payment=${encodeURIComponent(status || "unknown")}`
      );


    } catch (error) {

      console.error(
        "CHAPA CALLBACK ERROR:",
        error
      );

      return res.status(500).send(
        "Payment callback error."
      );

    }

  }
);


/*
==================================================
GET WALLET BALANCE
==================================================
*/

app.get(
  "/api/wallet",
  async (req, res) => {

    try {

      const user =
        await getUserFromToken(req);


      if (!user) {

        return res.status(401).json({

          success:
            false,

          message:
            "Please login first."

        });

      }


      const wallets =
        await supabaseRequest(
          `/rest/v1/wallets?user_id=eq.${encodeURIComponent(user.id)}&select=*`,
          {

            method:
              "GET"

          }
        );


      if (
        !wallets ||
        wallets.length === 0
      ) {

        return res.json({

          success:
            true,

          balance:
            0

        });

      }


      return res.json({

        success:
          true,

        balance:
          Number(
            wallets[0].balance || 0
          )

      });


    } catch (error) {

      console.error(
        "WALLET ERROR:",
        error
      );

      return res.status(500).json({

        success:
          false,

        message:
          "Could not load wallet.",

        error:
          error.message

      });

    }

  }
);


/*
==================================================
WITHDRAW
==================================================
*/

app.post(
  "/api/withdraw",
  async (req, res) => {

    try {

      const user =
        await getUserFromToken(req);


      if (!user) {

        return res.status(401).json({

          success:
            false,

          message:
            "Please login first."

        });

      }


      const amount =
        Number(req.body.amount);

      const phone =
        req.body.phone || "";


      if (
        !amount ||
        amount <= 0
      ) {

        return res.status(400).json({

          success:
            false,

          message:
            "Enter a valid withdrawal amount."

        });

      }


      if (!phone) {

        return res.status(400).json({

          success:
            false,

          message:
            "Enter your phone number."

        });

      }


      const wallets =
        await supabaseRequest(
          `/rest/v1/wallets?user_id=eq.${encodeURIComponent(user.id)}&select=*`,
          {

            method:
              "GET"

          }
        );


      if (
        !wallets ||
        wallets.length === 0
      ) {

        return res.status(400).json({

          success:
            false,

          message:
            "Wallet not found."

        });

      }


      const wallet =
        wallets[0];

      const balance =
        Number(
          wallet.balance || 0
        );


      if (
        amount >
        balance
      ) {

        return res.status(400).json({

          success:
            false,

          message:
            "Insufficient balance."

        });

      }


      await supabaseRequest(
        "/rest/v1/withdrawal_requests",
        {

          method:
            "POST",

          headers: {

            Prefer:
              "return=minimal"

          },

          body:
            JSON.stringify({

              user_id:
                user.id,

              amount:
                amount,

              phone:
                phone,

              status:
                "pending"

            })

        }
      );


      await supabaseRequest(
        `/rest/v1/wallets?id=eq.${encodeURIComponent(wallet.id)}`,
        {

          method:
            "PATCH",

          headers: {

            Prefer:
              "return=minimal"

          },

          body:
            JSON.stringify({

              balance:
                balance - amount,

              updated_at:
                new Date()
                  .toISOString()

            })

        }
      );


      return res.json({

        success:
          true,

        message:
          "Withdrawal request submitted successfully."

      });


    } catch (error) {

      console.error(
        "WITHDRAW ERROR:",
        error
      );

      return res.status(500).json({

        success:
          false,

        message:
          "Withdrawal failed.",

        error:
          error.message

      });

    }

  }
);


/*
==================================================
SERVE GUTU GAME WEBSITE
==================================================
*/

const publicPath =
  path.join(
    __dirname,
    ".."
  );


app.use(
  express.static(publicPath)
);


app.get(
  "/",
  (req, res) => {

    res.sendFile(
      path.join(
        publicPath,
        "index.html"
      )
    );

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
