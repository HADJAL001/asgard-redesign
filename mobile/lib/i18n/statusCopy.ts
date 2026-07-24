import { pluralRu } from './pluralRu';

export type AppLocale = 'ru' | 'en' | 'kz';

type StatusDictionary = {
  limitRemaining: (count: number) => string;
  limitDepleted: string;
  rechargeCta: string;
  rarityEdition: (rank: number, supply: number) => string;
  rarityUnique: string;
  rarityOneOfOne: string;
};

export const STATUS_COPY: Record<AppLocale, StatusDictionary> = {
  ru: {
    limitRemaining: (count) => `Осталось ${count} ${pluralRu(count, ['создание', 'создания', 'созданий'])} сегодня`,
    limitDepleted: 'Резерв на сегодня исчерпан',
    rechargeCta: 'Пополните резерв для создания',
    rarityEdition: (rank, supply) => `${rank} из ${supply}`,
    rarityUnique: 'Единственный экземпляр',
    rarityOneOfOne: 'Единственный в своём роде',
  },
  en: {
    limitRemaining: (count) => `${count} ${count === 1 ? 'creation' : 'creations'} left today`,
    limitDepleted: "Today's reserve is depleted",
    rechargeCta: 'Recharge your reserve to create',
    rarityEdition: (rank, supply) => `${rank} of ${supply}`,
    rarityUnique: 'One of a kind',
    rarityOneOfOne: 'The only one in existence',
  },
  kz: {
    limitRemaining: (count) => `Бүгін ${count} жасау мүмкіндігі қалды`,
    limitDepleted: 'Бүгінгі қор таусылды',
    rechargeCta: 'Жасау үшін қорды толтырыңыз',
    rarityEdition: (rank, supply) => `${supply} ішінен ${rank}`,
    rarityUnique: 'Жалғыз дана',
    rarityOneOfOne: 'Әлемде жалғыз',
  },
};
