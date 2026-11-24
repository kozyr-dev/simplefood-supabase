import { Edit, SimpleForm, TextInput, Title, required } from 'react-admin';
import { SeoInputs } from '../components/SeoInputs';
import { SETTINGS_ID } from '../providers/dataProvider';

/** The site's one settings record (a custom route, not a list). */
export function SettingsPage() {
  return (
    <>
      <Title title="Site settings" />
      <Edit
        resource="settings"
        id={SETTINGS_ID}
        mutationMode="pessimistic"
        redirect={false}
        title=" "
      >
        <SimpleForm>
          <TextInput
            source="siteName"
            label="Site name"
            validate={required()}
          />
          <TextInput source="phone" />
          <TextInput source="address" multiline fullWidth />
          <TextInput
            source="workingHours"
            label="Working hours"
            helperText="e.g. Mon–Sun 10:00–22:00"
          />
          <TextInput
            source="takingOrdersHours"
            label="Taking orders"
            helperText="e.g. until 21:30"
          />
          <TextInput
            source="facebook"
            label="Facebook URL"
            fullWidth
            helperText="https://…"
          />
          <TextInput
            source="instagram"
            label="Instagram URL"
            fullWidth
            helperText="https://…"
          />
          <SeoInputs />
        </SimpleForm>
      </Edit>
    </>
  );
}
