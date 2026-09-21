const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.use(express.static(path.join(__dirname, "..")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "index.html"));
});


/* =========================================
   AUTOMATIC CHAPA WITHDRAWAL
========================================= */

app.post("/api/withdraw", async (req, res) => {

  try {

    const {
      amount,
      accountNumber,
      accountName,
      bankCode,
      reference
    } = req.body;


    /* CHECK REQUIRED INFORMATION */

    if (
      !amount ||
      !accountNumber ||
      !accountName ||
      !bankCode ||
      !reference
    ) {

      return res.status(400).json({
        success: false,
        message: "Missing withdrawal information."
      });

    }


    const numericAmount = Number(amount);


    if (
      !Number.isFinite(numericAmount) ||
      numericAmount <= 0
    ) {

      return res.status(400).json({
        success: false,
        message: "Invalid withdrawal amount."
      });

    }


    /* CHAPA SECRET KEY */

    const chapaSecret =
      process.env.CHAPA_SECRET_KEY;


    if (!chapaSecret) {

      console.error(
        "CHAPA_SECRET_KEY is missing."
      );

      return res.status(500).json({
        success: false,
        message: "Chapa is not configured on the server."
      });

    }


    /* =========================================
       SEND MONEY THROUGH CHAPA
    ========================================= */

    const chapaResponse =
      await fetch(
        "https://api.chapa.co/v1/transfers",
        {

          method: "POST",

          headers: {
            "Authorization":
              `Bearer ${chapaSecret}`,

            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({

            account_name:
              accountName,

            account_number:
              accountNumber,

            amount:
              String(numericAmount),

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
      "Chapa transfer response:",
      chapaData
    );


    if (!chapaResponse.ok) {

      return res.status(400).json({

        success: false,

        message:
          chapaData.message ||
          "Chapa transfer failed.",

        chapa:
          chapaData

      });

    }


    /* =========================================
       SUCCESSFUL TRANSFER REQUEST
    ========================================= */

    return res.json({

      success: true,

      message:
        "Withdrawal sent to Chapa.",

      data:
        chapaData

    });


  } catch (error) {

    console.error(
      "Withdrawal error:",
      error
    );


    return res.status(500).json({

      success: false,

      message:
        "Server error while processing withdrawal."

    });

  }

});


app.listen(PORT, () => {

  console.log(
    `Gutu-Game running on port ${PORT}`
  );

});
