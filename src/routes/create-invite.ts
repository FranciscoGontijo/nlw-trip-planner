import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from 'zod';
import { prisma } from "../lib/prisma";
import { dayjs } from "../lib/dayjs";
import { getMailClient } from "../lib/mail";
import nodemailer from 'nodemailer';
import { ClientError } from "../errors/client-error";

export async function createInvite(app: FastifyInstance) {
    app.withTypeProvider<ZodTypeProvider>().post(
        '/trips/:tripId/invites',
        {
            schema: {
                params: z.object({
                    tripId: z.string().uuid(),
                }),
                body: z.object({
                    email: z.string().email(),
                })
            }
        }, async (request) => {
            const { tripId } = request.params
            const { email } = request.body

            const trip = await prisma.trip.findUnique({
                where: { id: tripId }
            })

            if (!trip) throw new ClientError('Trip not found');

            const participant = await prisma.participant.create({
                data: {
                    email,
                    trip_id: tripId
                }
            });

            const formatedStartDate = dayjs(trip.starts_at).format('LL');
            const formatedEndDate = dayjs(trip.ends_at).format('LL');

            const mail = await getMailClient();

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

            return { participantId: participant.id}
        })
};