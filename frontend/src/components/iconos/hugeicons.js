// Íconos de Hugeicons (@hugeicons/core-free-icons, licencia MIT) que usa la app, copiados del paquete.
// Por qué no se importan del paquete: su índice reexporta más de 6.000 íconos y, en `npm run dev`, Vite lo
// junta en un archivo de casi 8 MB que después no puede analizar ("Failed to parse source for import
// analysis"); y el "exports" del paquete no deja importarlos de a uno. Se dibujan igual con <HugeiconsIcon>
// de @hugeicons/react. Para sumar otro: copiar el arreglo de node_modules/@hugeicons/core-free-icons/dist/esm/<Nombre>.js.

export const Camera01Icon = [
  ['path', { d: 'M12.6974 3.5H11.303C10.5884 3.5 10.2311 3.5 9.91067 3.612C9.71499 3.68039 9.53113 3.77879 9.36568 3.90367C9.09474 4.10816 8.89655 4.40544 8.50018 5L8.50017 5.00001C8.29717 5.30453 7.99794 5.75337 7.87867 5.87871C7.58314 6.18927 7.19563 6.39666 6.77329 6.47029C6.60284 6.5 6.41985 6.5 6.05387 6.5C5.07379 6.5 4.58376 6.5 4.18307 6.61342C3.18074 6.89716 2.39734 7.68055 2.1136 8.68289C2.00018 9.08357 2.00018 9.57361 2.00018 10.5537V14.5C2.00018 17.3284 2.00018 18.7426 2.87886 19.6213C3.75754 20.5 5.17176 20.5 8.00018 20.5H16.0002C18.8286 20.5 20.2428 20.5 21.1215 19.6213C22.0002 18.7426 22.0002 17.3284 22.0002 14.5V10.5537C22.0002 9.57361 22.0002 9.08357 21.8868 8.68289C21.603 7.68055 20.8196 6.89716 19.8173 6.61342C19.4166 6.5 18.9266 6.5 17.9465 6.5C17.5805 6.5 17.3975 6.5 17.2271 6.47029C16.8047 6.39666 16.4172 6.18927 16.1217 5.87871C16.0024 5.75336 15.7032 5.30451 15.5002 5C15.1038 4.40544 14.9056 4.10816 14.6347 3.90367C14.4692 3.77879 14.2854 3.68039 14.0897 3.612C13.7693 3.5 13.412 3.5 12.6974 3.5Z', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: '1.5', key: '0' }],
  ['path', { d: 'M16.0002 13C16.0002 15.2091 14.2093 17 12.0002 17C9.79104 17 8.00018 15.2091 8.00018 13C8.00018 10.7909 9.79104 9 12.0002 9C14.2093 9 16.0002 10.7909 16.0002 13Z', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: '1.5', key: '1' }],
  ['path', { d: 'M19.1252 9.5H19.0002M19.2502 9.5C19.2502 9.63807 19.1383 9.75 19.0002 9.75C18.8621 9.75 18.7502 9.63807 18.7502 9.5C18.7502 9.36193 18.8621 9.25 19.0002 9.25C19.1383 9.25 19.2502 9.36193 19.2502 9.5Z', stroke: 'currentColor', strokeLinecap: 'round', strokeWidth: '1.5', key: '2' }],
]

export const Delete02Icon = [
  ['path', { d: 'M18.8516 16.3743L19.5 6H4.5L5.14839 16.3743C5.315 19.0401 5.39831 20.373 6.26426 21.1865C7.13021 22 8.46571 22 11.1367 22H12.8633C15.5343 22 16.8698 22 17.7357 21.1865C18.6017 20.373 18.685 19.0401 18.8516 16.3743Z', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: '1.5', key: '0' }],
  ['path', { d: 'M16 6H21M16 6L15.3778 4.34082C15.0007 3.33524 14.8122 2.83245 14.4402 2.50292C14.3213 2.39765 14.1904 2.3069 14.0501 2.2326C13.6109 2 13.074 2 12 2C10.926 2 10.3891 2 9.9499 2.2326C9.8096 2.3069 9.67865 2.39765 9.55982 2.50292C9.18783 2.83245 8.99928 3.33524 8.62219 4.34082L8 6M16 6H8M3 6H8', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: '1.5', key: '1' }],
  ['path', { d: 'M9.5 11V17M14.5 11V17', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: '1.5', key: '2' }],
]

export const Logout03Icon = [
  ['path', { d: 'M15.5 18.5C15.5 18.9644 15.5 19.1966 15.4743 19.3916C15.2971 20.7378 14.2378 21.7971 12.8916 21.9743C12.6966 22 12.4644 22 12 22H8.5C5.67157 22 4.25736 22 3.37868 21.1213C2.5 20.2426 2.5 18.8284 2.5 16V8C2.5 5.17157 2.5 3.75736 3.37868 2.87868C4.25736 2 5.67157 2 8.5 2H12C12.4644 2 12.6966 2 12.8916 2.02567C14.2378 2.2029 15.2971 3.26222 15.4743 4.60842C15.5 4.80337 15.5 5.03558 15.5 5.5', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: '1.5', key: '0' }],
  ['path', { d: 'M3.5 3L7.28886 4.89443L7.28886 4.89443C8.12141 5.43234 8.53769 5.7013 8.76885 6.18461C9 6.66791 9 7.26932 9 8.47214V14.8593C9 15.9072 9 16.4312 8.81686 16.8733C8.63372 17.3155 8.29634 17.6062 7.62158 18.1875L3.5 21', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: '1.5', key: '1' }],
  ['path', { d: 'M21.2131 12H13.4987M18.6316 9C19.6036 9.76 21.5 11.3289 21.5 12.0008C21.5 12.6728 19.6036 14.2417 18.6316 15.0017', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: '1.5', key: '2' }],
]

export const Notification03Icon = [
  ['path', { d: 'M20 18.5011L18.349 7.93407C17.8603 4.80601 15.166 2.5 12 2.5C8.83398 2.5 6.13971 4.80601 5.65098 7.93407L4 18.5011', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: '1.5', key: '0' }],
  ['path', { d: 'M20 18.5C20 16.8431 16.4183 15.5 12 15.5C7.58172 15.5 4 16.8431 4 18.5C4 20.1569 7.58172 21.5 12 21.5C16.4183 21.5 20 20.1569 20 18.5Z', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: '1.5', key: '1' }],
  ['path', { d: 'M13 18.5H11', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: '1.5', key: '2' }],
]
