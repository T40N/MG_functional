import {z} from 'zod';
import {validate} from '@common/core/usecases/validate';

/**
 * UWAGA: schemat musi pozostac REGULA W REGULE identyczny z
 * apps/oop/src/users/validators/userValidators.ts.
 *
 * Do 2026-08-25 oba schematy sprawdzaly rozne rzeczy: wersja funkcyjna miala
 * `max(30)` i regex z lookaheadem powtorzony takze na `confirm_password`,
 * wersja obiektowa — dwa proste regexy tylko na `password`. Skutki byly dwa:
 *   1. inne decyzje biznesowe dla tych samych danych (haslo bez cyfry
 *      przechodzilo w functional i odpadalo w oop; haslo 31-znakowe odwrotnie),
 *   2. inna ilosc pracy walidacyjnej na kazde zadanie S1, systematycznie
 *      na niekorzysc implementacji funkcyjnej.
 *
 * Schemat Zod jest tym samym deklaratywnym artefaktem w obu paradygmatach,
 * wiec roznica nie miala uzasadnienia w przedmiocie badania. Rozni sie
 * wylacznie SPOSOB WYWOLANIA walidacji (Either wobec wczesnego zwrotu),
 * i to jest wlasnie mierzona roznica paradygmatyczna.
 */
export const CreateUserDtoSchema = z.object({
  name: z.string().min(1),
  surname: z.string().min(1),
  email: z.string().email(),
  password: z.string()
    .min(8)
    .regex(/[A-Z]/, 'Must contain uppercase')
    .regex(/[0-9]/, 'Must contain digit'),
  confirm_password: z.string(),
}).refine((d) => d.password === d.confirm_password, {
  message: 'Passwords do not match',
  path: ['confirm_password'],
});

export const validateCreateUserRequest = validate(CreateUserDtoSchema);