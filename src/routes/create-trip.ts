import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from 'zod';
import { prisma } from "../lib/prisma";
import {dayjs} from "../lib/dayjs";
import { getMailClient } from "../lib/mail";
import nodemailer from 'nodemailer';

export async function createTrip(app: FastifyInstance) {
    app.withTypeProvider<ZodTypeProvider>().post('/trips', {
        schema: {
            body: z.object({
                destination: z.string().min(4),
                starts_at: z.coerce.date(),
                ends_at: z.coerce.date(),
                owner_name: z.string(),
                owner_email: z.string().email(),
                emails_to_invite: z.array(z.string().email())
            })
        }
    }, async (request) => {
        const { destination, ends_at, starts_at, owner_email, owner_name, emails_to_invite } = request.body

        if (dayjs(starts_at).isBefore(new Date())) {
            throw new Error('Invalid trip start date');
        };

        if (dayjs(ends_at).isBefore(starts_at)) {
            throw new Error('Invalid trip end date');
        };

        const trip = await prisma.trip.create({
            data: {
                destination,
                starts_at,
                ends_at,
                participants: {
                    createMany: {
                        data: [
                            {
                                name: owner_name,
                                email: owner_email,
                                is_owner: true,
                                is_confirmed: true
                            },
                            // Add all emails passed as emails to invite to participants
                            ...emails_to_invite.map(email => {
                                return { email }
                            })
                        ],
                    }
                }
            }
        });

        const formatedStartDate = dayjs(starts_at).format('LL');
        const formatedEndDate = dayjs(ends_at).format('LL');

        const confirmationLink = `http://localhost:3333/trips/${trip.id}/confirm`
        
        const mail = await getMailClient();

        const message = await mail.sendMail({
            from: {
                name: 'Equipe planner',
                address: 'oi@planner'
            },
            to: {
                name: owner_name,
                address: owner_email
            },
            subject: `Confirme sua viagem para ${destination}`,
            html: `<div>
                    <p>Você solicitou a criação de uma viagem para <strong>${destination}</strong> nas datas de <strong>${formatedStartDate} até ${formatedEndDate}</strong>.</p>
                    <br/>
                    <p>Para confirmar sua viagem, clique no link abaixo:"</p>
                    <br/>
                    <p>
                        <a href="${confirmationLink}">Confirmar viagem</a>
                    </p>
                    <br/>
                    <p>Caso você não saiba do que se trata esse e-mail, apenas ignore-o</p>
                </div>`.trim()
        });

        console.log(nodemailer.getTestMessageUrl(message))

        return { tripId: trip.id }
    })
};