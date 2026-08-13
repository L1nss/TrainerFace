import OpenAI from "openai";


const client =
    new OpenAI({
        apiKey:
            process.env.OPENAI_API_KEY
    });


export default async function handler(
    req,
    res
) {

    if (req.method !== "POST") {

        return res.status(405).json({
            error: "Método não permitido."
        });
    }


    try {

        const {
            fileName,
            mimeType,
            file
        } = req.body || {};


        if (!file) {

            return res.status(400).json({
                error:
                    "Nenhum arquivo enviado."
            });
        }


        if (
            mimeType !==
            "application/pdf"
        ) {

            return res.status(400).json({
                error:
                    "O arquivo precisa ser PDF."
            });
        }


        const buffer =
            Buffer.from(
                file,
                "base64"
            );


        if (
            buffer.length >
            10 * 1024 * 1024
        ) {

            return res.status(400).json({
                error:
                    "O PDF ultrapassa o limite de 10 MB."
            });
        }


        const uploadedFile =
            await client.files.create({

                file:
                    new File(
                        [
                            buffer
                        ],
                        fileName ||
                        "treino.pdf",
                        {
                            type:
                                "application/pdf"
                        }
                    ),

                purpose:
                    "user_data"

            });


        const response =
            await client.responses.create({

                model:
                    "gpt-5",

                input: [

                    {

                        role:
                            "user",

                        content: [

                            {

                                type:
                                    "input_file",

                                file_id:
                                    uploadedFile.id

                            },

                            {

                                type:
                                    "input_text",

                                text: `
Analise o PDF enviado.

Ele pode conter um treino de academia,
treino esportivo ou planejamento de exercícios.

Extraia somente as informações necessárias
para representar o treino.

Retorne SOMENTE JSON válido no seguinte formato:

{
  "name": "Nome do treino",
  "weekday": 1,
  "notes": "Observações",
  "exercises": [
    {
      "name": "Nome do exercício",
      "sets": 3,
      "reps": "8-12",
      "weight": null
    }
  ]
}

Regras:

- weekday deve ser:
  0 domingo
  1 segunda
  2 terça
  3 quarta
  4 quinta
  5 sexta
  6 sábado

- Se o PDF não informar o dia,
  use 1.

- Não invente exercícios que não estejam
  no documento.

- Se séries não estiverem informadas,
  use null.

- Se repetições não estiverem informadas,
  use null.

- Se peso não estiver informado,
  use null.

- Preserve os nomes dos exercícios.

- Não inclua explicações fora do JSON.
                                `

                            }

                        ]

                    }

                ]

            });


        let text =
            response.output_text;


        text =
            text
                .replace(/^```json/i, "")
                .replace(/^```/i, "")
                .replace(/```$/i, "")
                .trim();


        const workout =
            JSON.parse(text);


        if (
            !workout.name
        ) {

            workout.name =
                "Treino importado";
        }


        if (
            !Array.isArray(
                workout.exercises
            )
        ) {

            workout.exercises = [];
        }


        workout.weekday =
            Number.isInteger(
                workout.weekday
            )
                ? workout.weekday
                : 1;


        workout.exercises =
            workout.exercises.map(
                (exercise, index) => ({

                    name:
                        String(
                            exercise.name ||
                            "Exercício"
                        ),

                    sets:
                        exercise.sets === null
                            ? null
                            : Number(
                                exercise.sets
                            ) || null,

                    reps:
                        exercise.reps === null
                            ? null
                            : String(
                                exercise.reps ||
                                ""
                            ),

                    weight:
                        exercise.weight === null
                            ? null
                            : Number(
                                exercise.weight
                            ) || null,

                    position:
                        index

                })
            );


        return res.status(200).json({
            workout
        });


    } catch (error) {

        console.error(
            "Erro ao importar PDF:",
            error
        );


        return res.status(500).json({

            error:
                "Não foi possível interpretar o PDF."

        });
    }
}