import { useParams } from 'react-router-dom';
import { islandById } from '../campaign';
import { CampaignLevelPage } from './CampaignLevelPage';
import { CampaignMapPage } from './CampaignMapPage';

export function CampaignGate() {
  const { id } = useParams();
  if (islandById(decodeURIComponent(id ?? ''))) return <CampaignMapPage />;
  return <CampaignLevelPage />;
}
