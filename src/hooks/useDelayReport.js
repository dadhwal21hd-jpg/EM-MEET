import { useQuery } from '@tanstack/react-query'
import { api } from '../api/axios'

export function useDelayReport(daysBack) {
  return useQuery({
    queryKey: ['delay-report', daysBack],
    queryFn: async () => {
      const params = daysBack != null ? { days_back: daysBack } : {}
      const res = await api.get('/insights/delay-report', { params })
      return res.data
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  })
}
