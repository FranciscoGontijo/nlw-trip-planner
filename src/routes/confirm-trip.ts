import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from 'zod';
import { prisma } from "../lib/prisma";
import { dayjs } from "../lib/dayjs";
import { getMailClient } from "../lib/mail";
import nodemailer from 'nodemailer';
import { ClientError } from "../errors/client-error";


export async function confirmTrip(app: FastifyInstance) {
    app.withTypeProvider<ZodTypeProvider>().get('/trips/:tripId/confirm', {
        schema: {
            params: z.object({
                tripId: z.string().uuid(),
            })
        }
    }, async (request, reply) => {
        const { tripId } = request.params

        //Get trip object with a participants list included whithout the owner. This list will serve to send the trip confirmation email
        const trip = await prisma.trip.findUnique({
            where: {
                id: tripId
            },
            include: {
                participants: {
                    where: {
                        is_owner: false
                    }
                }
            }
        });


        if (!trip) throw new ClientError('Trips not found');

        if (trip.is_confirmed) return reply.redirect(`http://localhost:3000/trips/${tripId}`);

        await prisma.trip.update({
            where: { id: tripId },
            data: { is_confirmed: true }
        });

        const formatedStartDate = dayjs(trip.starts_at).format('LL');
        const formatedEndDate = dayjs(trip.ends_at).format('LL');
        
        const mail = await getMailClient();

        await Promise.all(
            trip.participants.map(async (participant) => {
                const confirmationLink = `http://localhost:3333/participants/${participant.id}/confirm`

                const message = await mail.sendMail({
                    from: {
                        name: 'Equipe planner',
                        address: 'oi@planner'
                    },
                    to: participant.email,
                    subject: `Viagem confirmada para ${trip.destination}`,
                    html: `<div>
                            <p>Você foi convidado para uma viagem para <strong>${trip.destination}</strong> nas datas de <strong>${formatedStartDate} até ${formatedEndDate}</strong>.</p>
                            <br/>
                            <p>Para confirmar sua presença na viagem</p>
                            <br/>
                            <p>
                                <a href="${confirmationLink}">Confirmar viagem</a>
                            </p>
                            <br/>
                            <p>Caso você não saiba do que se trata esse e-mail, apenas ignore-o</p>
                        </div>`.trim()
                });
        
                console.log(nodemailer.getTestMessageUrl(message))
            })
        )

        return reply.redirect(`http://localhost:3000/trips/${tripId}`);
    })
};