/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

import { FILTER_ALL } from '../constants'

type GroupDescriptionProps = {
  selectedGroup: string
  availableGroups: string[]
  usableGroup: Record<string, string>
}

export function GroupDescription(props: GroupDescriptionProps) {
  const { t } = useTranslation()
  const description =
    props.selectedGroup !== FILTER_ALL &&
    props.availableGroups.includes(props.selectedGroup)
      ? props.usableGroup[props.selectedGroup]?.trim()
      : ''

  if (!description) return null

  return (
    <Alert>
      <AlertTitle>{t('Group description')}</AlertTitle>
      <AlertDescription className='min-w-0 [overflow-wrap:anywhere] whitespace-pre-wrap'>
        {description}
      </AlertDescription>
    </Alert>
  )
}
