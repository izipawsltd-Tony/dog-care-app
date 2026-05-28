import { FC } from 'react';

interface LitterTabProps {
  litters: any[];
  damName: string;
  onChange: (litters: any[]) => void;
}

declare const LitterTab: FC<LitterTabProps>;
export default LitterTab;