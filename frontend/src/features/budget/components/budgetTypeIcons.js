import ApartmentOutlinedIcon from '@mui/icons-material/ApartmentOutlined';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';

/** One icon per budget type, shared by the type picker and the budget list. */
export const BUDGET_TYPE_ICON = Object.freeze({
  ORGANISATION: ApartmentOutlinedIcon,
  PROGRAMME: CategoryOutlinedIcon,
  PROJECT: AccountTreeOutlinedIcon,
});
