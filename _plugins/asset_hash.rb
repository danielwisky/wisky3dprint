# Cache-busting por conteúdo: gera um hash curto do arquivo (em vez de
# site.time, que muda a cada build mesmo sem o asset ter mudado, invalidando
# o cache do navegador à toa a cada deploy).
require "digest"

module Jekyll
  module AssetHashFilter
    def asset_hash(path)
      file_path = File.join(Dir.pwd, path.to_s.sub(%r{\A/}, ""))
      return "0" unless File.exist?(file_path)

      # Um .scss é só a lista de @use dos partials em _sass/: o hash precisa
      # incluir os partials, senão editar um deles não muda o ?v=.
      arquivos = [file_path]
      arquivos += Dir.glob(File.join(Dir.pwd, "_sass", "**", "*.scss")).sort if file_path.end_with?(".scss")

      digest = Digest::MD5.new
      arquivos.each { |arquivo| digest.update(File.binread(arquivo)) }
      digest.hexdigest[0, 8]
    end
  end
end

Liquid::Template.register_filter(Jekyll::AssetHashFilter)
